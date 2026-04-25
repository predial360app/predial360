import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface EtaResult {
  serviceOrderId: string;
  technicianLocation: LatLng | null;
  destination: LatLng;
  distanceMeters: number | null;
  durationSeconds: number | null;
  durationText: string | null;
  distanceText: string | null;
  technicianStatus: 'EN_ROUTE' | 'ON_SITE' | 'IDLE' | 'OFFLINE';
  lastUpdatedAt: string | null;
}

@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);
  private readonly mapsApiKey: string;
  private readonly ROUTES_URL =
    'https://routes.googleapis.com/directions/v2:computeRoutes';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.mapsApiKey = this.configService.getOrThrow<string>('app.google.mapsApiKey');
  }

  async computeEta(serviceOrderId: string): Promise<EtaResult> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, deletedAt: null },
      select: {
        id: true,
        technicianId: true,
        technicianLatitude: true,
        technicianLongitude: true,
        property: {
          select: { latitude: true, longitude: true },
        },
      },
    });

    if (!order) throw new NotFoundException('OS não encontrada.');

    // Destino = localização do imóvel
    const destination: LatLng | null =
      order.property.latitude && order.property.longitude
        ? {
            latitude: Number(order.property.latitude),
            longitude: Number(order.property.longitude),
          }
        : null;

    if (!destination) {
      throw new ServiceUnavailableException('Imóvel sem coordenadas cadastradas.');
    }

    // Localização do técnico — Redis primeiro (tempo real), depois DB
    let technicianLocation: LatLng | null = null;
    let lastUpdatedAt: string | null = null;
    let technicianStatus: EtaResult['technicianStatus'] = 'OFFLINE';

    if (order.technicianId) {
      const redisKey = `location:technician:${order.technicianId}:order:${serviceOrderId}`;
      const cached = await this.redis.getJson<{
        latitude: number;
        longitude: number;
        timestamp: string;
        status: string;
      }>(redisKey);

      if (cached) {
        technicianLocation = { latitude: cached.latitude, longitude: cached.longitude };
        lastUpdatedAt = cached.timestamp;
        technicianStatus = cached.status as EtaResult['technicianStatus'];
      } else if (order.technicianLatitude && order.technicianLongitude) {
        // fallback: última localização salva no banco
        technicianLocation = {
          latitude: Number(order.technicianLatitude),
          longitude: Number(order.technicianLongitude),
        };
        technicianStatus = 'IDLE';
      }
    }

    if (!technicianLocation) {
      return {
        serviceOrderId,
        technicianLocation: null,
        destination,
        distanceMeters: null,
        durationSeconds: null,
        durationText: null,
        distanceText: null,
        technicianStatus,
        lastUpdatedAt,
      };
    }

    // Chamar Google Routes API
    try {
      const response = await axios.post<{
        routes: Array<{
          distanceMeters: number;
          duration: string;
          localizedValues: {
            distance: { text: string };
            duration: { text: string };
          };
        }>;
      }>(
        this.ROUTES_URL,
        {
          origin: {
            location: {
              latLng: {
                latitude: technicianLocation.latitude,
                longitude: technicianLocation.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          languageCode: 'pt-BR',
          units: 'METRIC',
        },
        {
          headers: {
            'X-Goog-Api-Key': this.mapsApiKey,
            'X-Goog-FieldMask':
              'routes.distanceMeters,routes.duration,routes.localizedValues',
          },
          timeout: 5000,
        },
      );

      const route = response.data.routes[0];
      if (!route) throw new Error('Nenhuma rota encontrada.');

      // duration vem como string "Xs" (segundos) da API v2
      const durationSeconds = parseInt(route.duration.replace('s', ''), 10);

      return {
        serviceOrderId,
        technicianLocation,
        destination,
        distanceMeters: route.distanceMeters,
        durationSeconds,
        durationText: route.localizedValues?.duration?.text ?? `${Math.round(durationSeconds / 60)} min`,
        distanceText: route.localizedValues?.distance?.text ?? `${(route.distanceMeters / 1000).toFixed(1)} km`,
        technicianStatus,
        lastUpdatedAt,
      };
    } catch (err) {
      this.logger.error(
        `Google Routes API error: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Retorna sem ETA em caso de falha na API (não quebra o fluxo)
      return {
        serviceOrderId,
        technicianLocation,
        destination,
        distanceMeters: null,
        durationSeconds: null,
        durationText: null,
        distanceText: null,
        technicianStatus,
        lastUpdatedAt,
      };
    }
  }

  // ── GET /service-orders/:id/tracking ─────────────────────────────────────
  // Enriquece o ETA com dados do técnico e da OS para o app do proprietário.

  async getTracking(serviceOrderId: string, requesterId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, deletedAt: null },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        ownerId: true,
        technician: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            rating: true,
            phone: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('OS não encontrada.');

    // Proprietário só vê sua própria OS
    if (order.ownerId !== requesterId) {
      const { ForbiddenException } = await import('@nestjs/common');
      throw new ForbiddenException('Acesso negado a esta OS.');
    }

    // Reutiliza computeEta para obter localização + ETA
    const eta = await this.computeEta(serviceOrderId);

    // Alerta de proximidade (≤500m) — emitido via push apenas uma vez por viagem
    if (
      eta.distanceMeters !== null &&
      eta.distanceMeters <= 500 &&
      eta.technicianStatus === 'EN_ROUTE'
    ) {
      this.logger.log(`Técnico a ${eta.distanceMeters}m da OS ${order.code} — proximidade!`);
      // Push será disparado externamente pela LocationGateway ao detectar o threshold
    }

    return {
      ...eta,
      technician: order.technician
        ? {
            id: order.technician.id,
            name: order.technician.name,
            avatarUrl: order.technician.avatarUrl,
            rating: order.technician.rating ? Number(order.technician.rating) : null,
            phone: order.technician.phone,
          }
        : null,
      order: {
        id: order.id,
        code: order.code,
        title: order.title,
        status: order.status,
      },
    };
  }
}
