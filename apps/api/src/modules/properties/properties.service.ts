import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, type Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import type { CreatePropertyDto, UpdatePropertyDto } from './dto/create-property.dto';
import type { PaginationQuery } from '@predial360/shared';

// ── Tipos de retorno ──────────────────────────────────────────────────────────

export interface PropertyHealthScore {
  score: number;           // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    maintenanceCompliance: number;  // % ativos em dia
    openNonConformities: number;    // OS abertas críticas
    contractActive: boolean;
    buildingAge: number;            // penaliza edificações mais antigas
  };
  alerts: string[];
}

export type PropertyWithScore = Awaited<ReturnType<PropertiesService['findById']>>;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);
  private readonly SCORE_CACHE_TTL = 300; // 5 min

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(ownerId: string, dto: CreatePropertyDto) {
    const property = await this.prisma.property.create({
      data: {
        ownerId,
        name: dto.name,
        type: dto.type,
        description: dto.description,
        street: dto.street,
        number: dto.number,
        complement: dto.complement,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state.toUpperCase(),
        zipCode: dto.zipCode,
        country: 'BR',
        latitude: dto.latitude,
        longitude: dto.longitude,
        buildingAge: dto.buildingAge,
        totalArea: dto.totalArea,
        floors: dto.floors,
        units: dto.units,
        registrationNumber: dto.registrationNumber,
        habitaseNumber: dto.habitaseNumber,
        constructionYear: dto.constructionYear,
      },
      include: { assets: true },
    });

    this.logger.log(`Imóvel criado: ${property.id} — ${property.name} (owner: ${ownerId})`);
    return property;
  }

  async findAll(
    requesterId: string,
    requesterRole: UserRole,
    query: PaginationQuery & { city?: string; type?: string },
  ) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      ...(requesterRole === UserRole.OWNER ? { ownerId: requesterId } : {}),
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.type ? { type: { equals: query.type as Prisma.EnumPropertyTypeFilter['equals'] } } : {}),
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { neighborhood: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { assets: true, serviceOrders: true } },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findById(id: string, requesterId: string, requesterRole: UserRole) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: {
        assets: { where: { deletedAt: null }, orderBy: { category: 'asc' } },
        contracts: { where: { deletedAt: null, status: 'ACTIVE' }, take: 1 },
        _count: { select: { serviceOrders: true } },
      },
    });

    if (!property) throw new NotFoundException('Imóvel não encontrado.');
    this.assertAccess(property.ownerId, requesterId, requesterRole);

    const healthScore = await this.computeHealthScore(id, property);
    return { ...property, healthScore };
  }

  async update(
    id: string,
    requesterId: string,
    requesterRole: UserRole,
    dto: UpdatePropertyDto,
  ) {
    const property = await this.findRawOrThrow(id);
    this.assertAccess(property.ownerId, requesterId, requesterRole);

    const updated = await this.prisma.property.update({
      where: { id },
      data: { ...dto },
    });

    await this.redis.del(`property:score:${id}`);
    return updated;
  }

  async remove(id: string, requesterId: string, requesterRole: UserRole) {
    const property = await this.findRawOrThrow(id);
    this.assertAccess(property.ownerId, requesterId, requesterRole);

    await this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── Health Score ───────────────────────────────────────────────────────────

  async computeHealthScore(
    propertyId: string,
    property?: Awaited<ReturnType<typeof this.prisma.property.findFirst>>,
  ): Promise<PropertyHealthScore> {
    const cacheKey = `property:score:${propertyId}`;
    const cached = await this.redis.getJson<PropertyHealthScore>(cacheKey);
    if (cached) return cached;

    const [assets, openCriticalOrders, activeContract] = await Promise.all([
      this.prisma.asset.findMany({
        where: { propertyId, deletedAt: null },
        select: { status: true, nextMaintenanceDate: true },
      }),
      this.prisma.serviceOrder.count({
        where: {
          propertyId,
          status: { in: ['PENDING', 'IN_PROGRESS', 'ASSIGNED'] },
          priority: { in: ['URGENT', 'EMERGENCY'] },
          deletedAt: null,
        },
      }),
      this.prisma.contract.findFirst({
        where: { propertyId, status: 'ACTIVE', deletedAt: null },
      }),
    ]);

    const alerts: string[] = [];
    const now = new Date();

    // ── Pontuação de manutenção (40 pts) ─────────────────────────────────────
    let maintenanceScore = 40;
    const assetsWithDates = assets.filter((a) => a.nextMaintenanceDate);
    if (assetsWithDates.length > 0) {
      const overdueAssets = assetsWithDates.filter(
        (a) => a.nextMaintenanceDate! < now,
      );
      const dueSoonAssets = assetsWithDates.filter((a) => {
        const daysLeft =
          (a.nextMaintenanceDate!.getTime() - now.getTime()) / 86400000;
        return daysLeft >= 0 && daysLeft <= 30;
      });

      const overdueRatio = overdueAssets.length / assetsWithDates.length;
      maintenanceScore = Math.round(40 * (1 - overdueRatio));

      if (overdueAssets.length > 0) {
        alerts.push(`${overdueAssets.length} ativo(s) com manutenção vencida.`);
      }
      if (dueSoonAssets.length > 0) {
        alerts.push(`${dueSoonAssets.length} ativo(s) com manutenção vencendo em 30 dias.`);
      }
    }

    // ── Ativos operacionais (20 pts) ──────────────────────────────────────────
    let assetStatusScore = 20;
    if (assets.length > 0) {
      const inactive = assets.filter(
        (a) => a.status === AssetStatus.DEACTIVATED || a.status === AssetStatus.SCRAPPED,
      ).length;
      assetStatusScore = Math.round(20 * (1 - inactive / assets.length));
    }

    // ── OS críticas abertas (20 pts) ──────────────────────────────────────────
    const criticalScore = Math.max(0, 20 - openCriticalOrders * 5);
    if (openCriticalOrders > 0) {
      alerts.push(`${openCriticalOrders} OS urgente(s)/emergência(s) em aberto.`);
    }

    // ── Contrato ativo (10 pts) ───────────────────────────────────────────────
    const contractScore = activeContract ? 10 : 0;
    if (!activeContract) alerts.push('Sem contrato ativo — cobertura limitada.');

    // ── Idade da edificação (10 pts) ──────────────────────────────────────────
    const buildingAge = property?.buildingAge ?? 0;
    const ageScore = buildingAge <= 5 ? 10 : buildingAge <= 15 ? 7 : buildingAge <= 30 ? 4 : 2;
    if (buildingAge > 30) {
      alerts.push(`Edificação com ${buildingAge} anos — atenção redobrada (NBR 5674).`);
    }

    const score = maintenanceScore + assetStatusScore + criticalScore + contractScore + ageScore;
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

    const result: PropertyHealthScore = {
      score,
      grade,
      breakdown: {
        maintenanceCompliance: maintenanceScore,
        openNonConformities: openCriticalOrders,
        contractActive: !!activeContract,
        buildingAge,
      },
      alerts,
    };

    await this.redis.setJson(cacheKey, result, this.SCORE_CACHE_TTL);
    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findRawOrThrow(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Imóvel não encontrado.');
    return property;
  }

  private assertAccess(ownerId: string, requesterId: string, role: UserRole): void {
    if (role === UserRole.ADMIN) return;
    if (ownerId !== requesterId) {
      throw new ForbiddenException('Acesso negado a este imóvel.');
    }
  }
}
