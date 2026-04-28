import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../database/redis.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import type { JwtPayload } from '@predial360/shared';

/** Raio (metros) para disparo do alerta de proximidade ao proprietário */
const PROXIMITY_ALERT_RADIUS_M = 500;

/** TTL (segundos) do flag de deduplicação de alerta no Redis */
const PROXIMITY_ALERT_DEDUP_TTL_S = 600; // 10 minutos

interface LocationUpdatePayload {
  serviceOrderId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  /** Status calculado pelo app do técnico (distância ao destino) */
  status?: 'EN_ROUTE' | 'ON_SITE' | 'IDLE';
}

interface LocationSubscribePayload {
  serviceOrderId: string;
}

interface StoredLocation {
  technicianId: string;
  serviceOrderId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: string;
  status: 'EN_ROUTE' | 'ON_SITE' | 'IDLE';
}

@WebSocketGateway({
  namespace: '/location',
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:19006'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class LocationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(LocationGateway.name);

  // Map: socketId → technicianId (para cleanup no disconnect)
  private readonly connectedTechnicians = new Map<string, string>();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  afterInit(): void {
    this.logger.log('LocationGateway iniciado no namespace /location');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('app.jwt.accessSecret'),
      });
      // Armazenar userId no socket para uso posterior
      client.data = { userId: payload.sub, role: payload.role };
      this.logger.log(`Cliente conectado: ${client.id} [${payload.role}]`);
    } catch {
      this.logger.warn(`Conexão rejeitada — token inválido: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const technicianId = this.connectedTechnicians.get(client.id);
    if (technicianId) {
      this.connectedTechnicians.delete(client.id);
      this.logger.log(`Técnico desconectado: ${technicianId}`);
    }
  }

  /**
   * Evento: location:update
   * Emitido pelo técnico a cada ~15 segundos quando há OS ativa.
   * Armazena no Redis (TTL 60s) e publica para os subscribers.
   */
  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationUpdatePayload,
  ): Promise<void> {
    const { userId } = client.data as { userId: string; role: string };

    // Verificar se a OS está atribuída a este técnico
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: payload.serviceOrderId,
        technicianId: userId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        deletedAt: null,
      },
      select: {
        id: true,
        ownerId: true,
        property: {
          select: { latitude: true, longitude: true },
        },
        // ISSUE #8: incluso aqui para evitar N+1 no checkProximityAlert
        owner: {
          select: { fcmTokens: true },
        },
      },
    });

    if (!order) {
      client.emit('error', { message: 'OS não encontrada ou não atribuída.' });
      return;
    }

    const location: StoredLocation = {
      technicianId: userId,
      serviceOrderId: payload.serviceOrderId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy,
      heading: payload.heading,
      speed: payload.speed,
      timestamp: new Date().toISOString(),
      status: payload.status ?? 'EN_ROUTE',
    };

    // Salvar no Redis com TTL de 90s (padrão de rastreamento em tempo real)
    const redisKey = `location:technician:${userId}:order:${payload.serviceOrderId}`;
    await this.redis.setJson(redisKey, location, 90);

    // Também salva pela chave simples por techId (para leitura rápida)
    await this.redis.setJson(`location:${userId}`, location, 90);

    // Salvar última localização no banco (throttled — apenas a cada update)
    await this.prisma.serviceOrder.update({
      where: { id: payload.serviceOrderId },
      data: {
        technicianLatitude: payload.latitude,
        technicianLongitude: payload.longitude,
      },
    });

    // Publicar para os subscribers da sala
    // Emite dois eventos para compatibilidade: legacy 'location:updated' e spec 'order:location'
    const room = `order:${payload.serviceOrderId}`;
    this.server.to(room).emit('location:updated', location);  // compatibilidade
    this.server.to(room).emit('order:location', {             // spec
      lat: location.latitude,
      lng: location.longitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      status: location.status,
      timestamp: location.timestamp,
    });

    this.connectedTechnicians.set(client.id, userId);

    // Verificar proximidade ao local da OS e notificar proprietário
    const orderAny = order as unknown as Record<string, unknown>;
    await this.checkProximityAlert(
      (orderAny['owner'] as { fcmTokens: string[] } | undefined)?.fcmTokens ?? [],
      payload.latitude,
      payload.longitude,
      (orderAny['property'] as { latitude: unknown; longitude: unknown } | null) ?? null,
      payload.serviceOrderId,
    );
  }

  /**
   * Evento: tech:location (alias de location:update — compatibilidade com spec)
   */
  @SubscribeMessage('tech:location')
  async handleTechLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationUpdatePayload,
  ): Promise<void> {
    return this.handleLocationUpdate(client, payload);
  }

  /**
   * Evento: location:subscribe
   * Emitido pelo proprietário/admin para receber updates de uma OS.
   * O cliente entra na room correspondente.
   */
  @SubscribeMessage('location:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationSubscribePayload,
  ): Promise<void> {
    const { userId, role } = client.data as { userId: string; role: string };

    // Verificar acesso
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: payload.serviceOrderId,
        deletedAt: null,
        ...(role === 'OWNER' ? { ownerId: userId } : {}),
      },
      select: { id: true, technicianId: true },
    });

    if (!order) {
      client.emit('error', { message: 'Acesso negado ou OS não encontrada.' });
      return;
    }

    const room = `order:${payload.serviceOrderId}`;
    await client.join(room);

    // Enviar última localização conhecida do Redis
    if (order.technicianId) {
      const redisKey = `location:technician:${order.technicianId}:order:${payload.serviceOrderId}`;
      const lastLocation = await this.redis.getJson<StoredLocation>(redisKey);
      if (lastLocation) {
        client.emit('location:updated', lastLocation);
      }
    }

    client.emit('location:subscribed', { serviceOrderId: payload.serviceOrderId });
    this.logger.log(`${userId} subscribed to OS ${payload.serviceOrderId}`);
  }

  /**
   * Evento: location:unsubscribe
   * Remove o cliente da room.
   */
  @SubscribeMessage('location:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationSubscribePayload,
  ): Promise<void> {
    const room = `order:${payload.serviceOrderId}`;
    await client.leave(room);
    client.emit('location:unsubscribed', { serviceOrderId: payload.serviceOrderId });
  }

  // ── Helpers privados ─────────────────────────────────────────────────────

  /**
   * Verifica se o técnico está a menos de 500m do local da OS.
   * Usa deduplicação via Redis para não disparar múltiplos alertas.
   *
   * ISSUE #8: fcmTokens já vem do JOIN com `owner` no findFirst da OS,
   * eliminando um round-trip extra ao banco por update de localização.
   *
   * @param ownerFcmTokens - Tokens FCM do proprietário (já carregados na query da OS)
   * @param techLat        - Latitude atual do técnico
   * @param techLng        - Longitude atual do técnico
   * @param property       - Dados da propriedade (coordenadas + endereço)
   * @param serviceOrderId - ID da OS (usado na chave de dedup Redis)
   */
  private async checkProximityAlert(
    ownerFcmTokens: string[],
    techLat: number,
    techLng: number,
    property: { latitude: number | null; longitude: number | null; address: string | null } | null,
    serviceOrderId: string,
  ): Promise<void> {
    if (!property?.latitude || !property?.longitude) return;
    if (!ownerFcmTokens.length) return;

    const distanceM = this.haversineMeters(
      techLat,
      techLng,
      property.latitude,
      property.longitude,
    );

    if (distanceM > PROXIMITY_ALERT_RADIUS_M) return;

    // Deduplicação: só dispara uma vez por intervalo de 10 minutos
    const dedupKey = `proximity:alert:${serviceOrderId}`;
    const alreadySent = await this.redis.get(dedupKey);
    if (alreadySent) return;

    await this.redis.set(dedupKey, '1', PROXIMITY_ALERT_DEDUP_TTL_S);

    const address = property.address ?? 'sua propriedade';

    await this.notifications.sendPush(
      ownerFcmTokens,
      '⚡ Técnico chegando!',
      `O técnico está a menos de 500m de ${address}.`,
      {
        type: 'TECHNICIAN_NEARBY',
        serviceOrderId,
        distanceMeters: String(Math.round(distanceM)),
      },
    );

    this.logger.log(
      `Alerta de proximidade (${Math.round(distanceM)}m) — OS ${serviceOrderId}`,
    );
  }

  /**
   * Distância Haversine entre dois pontos (em metros).
   */
  private haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6_371_000; // raio médio da Terra em metros
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private extractToken(client: Socket): string {
    const auth =
      client.handshake.auth?.['token'] as string | undefined ??
      (client.handshake.headers.authorization as string | undefined)?.replace('Bearer ', '');

    if (!auth) throw new WsException('Token ausente.');
    return auth;
  }
}
