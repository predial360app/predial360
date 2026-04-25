import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type Prisma,
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderType,
  UserRole,
} from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AssignTechnicianDto,
  CreateServiceOrderDto,
  SaveSignatureDto,
  UpdateServiceOrderDto,
} from './dto/service-order.dto';
import type { PaginationQuery } from '@predial360/shared';

/** SLA em horas por prioridade */
const SLA_HOURS: Record<ServiceOrderPriority, number> = {
  EMERGENCY: 4,
  URGENT: 12,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
};

@Injectable()
export class ServiceOrdersService {
  private readonly logger = new Logger(ServiceOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Criar OS ───────────────────────────────────────────────────────────────

  async create(ownerId: string, dto: CreateServiceOrderDto) {
    // Verificar acesso ao imóvel
    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Imóvel não encontrado.');
    if (property.ownerId !== ownerId) throw new ForbiddenException('Acesso negado.');

    // Calcular SLA deadline
    const slaDeadline = this.computeSlaDeadline(dto.priority);

    // Código sequencial
    const code = await this.generateCode();

    const order = await this.prisma.serviceOrder.create({
      data: {
        code,
        propertyId: dto.propertyId,
        ownerId,
        assetId: dto.assetId,
        type: dto.type,
        status: ServiceOrderStatus.PENDING,
        priority: dto.priority,
        title: dto.title,
        description: dto.description,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        estimatedCost: dto.estimatedCost,
        applicableNorms: (dto.applicableNorms as string[]) ?? [],
        ownerNotes: dto.ownerNotes,
      },
      include: {
        property: { select: { name: true, city: true, state: true } },
        owner: { select: { name: true, fcmTokens: true } },
      },
    });

    this.logger.log(`OS criada: ${order.code} [${order.priority}] — SLA: ${slaDeadline.toISOString()}`);

    // Auditoria
    await this.prisma.auditLog.create({
      data: {
        userId: ownerId,
        action: 'CREATE',
        resource: 'ServiceOrder',
        resourceId: order.id,
        newData: { code: order.code, type: order.type, priority: order.priority },
      },
    });

    return { ...order, slaDeadline };
  }

  // ── Listar OS ──────────────────────────────────────────────────────────────

  async findAll(
    requesterId: string,
    requesterRole: UserRole,
    query: PaginationQuery & {
      status?: string;
      priority?: string;
      propertyId?: string;
    },
  ) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.ServiceOrderWhereInput = {
      deletedAt: null,
      ...(requesterRole === UserRole.OWNER ? { ownerId: requesterId } : {}),
      ...(requesterRole === UserRole.TECHNICIAN ? { technicianId: requesterId } : {}),
      ...(query.status ? { status: { equals: query.status as ServiceOrderStatus } } : {}),
      ...(query.priority ? { priority: { equals: query.priority as ServiceOrderPriority } } : {}),
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          property: { select: { name: true, city: true, state: true } },
          technician: { select: { name: true, avatarUrl: true } },
        },
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);

    const dataWithSla = data.map((order) => ({
      ...order,
      slaDeadline: this.computeSlaDeadline(order.priority, order.createdAt),
      slaExpired: this.isSlaExpired(order.priority, order.createdAt),
    }));

    return {
      data: dataWithSla,
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

  // ── Detalhes da OS ────────────────────────────────────────────────────────

  async findById(id: string, requesterId: string, requesterRole: UserRole) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        property: true,
        owner: { select: { name: true, email: true, phone: true } },
        technician: { select: { name: true, email: true, phone: true, crea: true, rating: true } },
        checklist: { include: { items: { orderBy: { order: 'asc' } } } },
        report: true,
        payment: true,
      },
    });

    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');

    this.assertAccess(order, requesterId, requesterRole);

    return {
      ...order,
      slaDeadline: this.computeSlaDeadline(order.priority, order.createdAt),
      slaExpired: this.isSlaExpired(order.priority, order.createdAt),
    };
  }

  // ── Atualizar status ───────────────────────────────────────────────────────

  async updateStatus(
    id: string,
    requesterId: string,
    requesterRole: UserRole,
    dto: UpdateServiceOrderDto,
  ) {
    const order = await this.findById(id, requesterId, requesterRole);

    if (dto.status) {
      this.validateStatusTransition(order.status, dto.status, requesterRole);
    }

    const updatedData: Prisma.ServiceOrderUpdateInput = {
      ...dto,
      ...(dto.status === ServiceOrderStatus.IN_PROGRESS ? { startedAt: new Date() } : {}),
      ...(dto.status === ServiceOrderStatus.COMPLETED ? { completedAt: new Date() } : {}),
    };

    if (dto.technicianId) updatedData.technician = { connect: { id: dto.technicianId } };

    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data: updatedData,
      include: {
        owner: { select: { fcmTokens: true, name: true } },
        technician: { select: { fcmTokens: true, name: true } },
      },
    });

    // Push notification ao mudar status
    if (dto.status) {
      await this.sendStatusNotification(updated, dto.status);
    }

    return updated;
  }

  // ── Atribuir técnico ──────────────────────────────────────────────────────

  async assignTechnician(
    id: string,
    requesterId: string,
    requesterRole: UserRole,
    dto: AssignTechnicianDto,
  ) {
    if (requesterRole !== UserRole.ADMIN) throw new ForbiddenException('Somente ADMIN pode atribuir técnicos.');

    const order = await this.findById(id, requesterId, requesterRole);

    if (!['PENDING', 'ON_HOLD'].includes(order.status)) {
      throw new BadRequestException(`Não é possível atribuir técnico em status ${order.status}.`);
    }

    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        technicianId: dto.technicianId,
        status: ServiceOrderStatus.ASSIGNED,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      },
      include: {
        owner: { select: { fcmTokens: true } },
        technician: { select: { fcmTokens: true, name: true } },
      },
    });

    // Notificar proprietário e técnico
    await Promise.all([
      this.notifications.sendPush(
        updated.owner.fcmTokens,
        'Técnico designado ✓',
        `${updated.technician?.name ?? 'Técnico'} foi designado para a sua OS.`,
        { serviceOrderId: id },
      ),
      this.notifications.sendPush(
        updated.technician?.fcmTokens ?? [],
        'Nova OS atribuída',
        `Você foi designado para a OS ${order.code}.`,
        { serviceOrderId: id },
      ),
    ]);

    return updated;
  }

  // ── Cron: verificar SLA a cada 5 minutos ──────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSlaBreach(): Promise<void> {
    const warningMinutes = 30;
    const now = new Date();

    // Buscar OS abertas que vão vencer em 30 minutos
    const urgentOrders = await this.prisma.$queryRaw<
      { id: string; code: string; priority: string; ownerId: string; technicianId: string | null; createdAt: Date }[]
    >`
      SELECT id, code, priority, "ownerId", "technicianId", "createdAt"
      FROM service_orders
      WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'DRAFT')
        AND "deletedAt" IS NULL
        AND "createdAt" + (
          CASE priority
            WHEN 'EMERGENCY' THEN interval '4 hours'
            WHEN 'URGENT'    THEN interval '12 hours'
            WHEN 'HIGH'      THEN interval '24 hours'
            WHEN 'MEDIUM'    THEN interval '48 hours'
            WHEN 'LOW'       THEN interval '72 hours'
          END
        ) BETWEEN ${now} AND ${new Date(now.getTime() + warningMinutes * 60000)}
    `;

    for (const order of urgentOrders) {
      this.logger.warn(`SLA prestes a vencer: OS ${order.code} [${order.priority}]`);

      const tokens: string[] = [];

      // Buscar tokens do proprietário e técnico
      const [owner, technician] = await Promise.all([
        this.prisma.user.findFirst({ where: { id: order.ownerId }, select: { fcmTokens: true } }),
        order.technicianId
          ? this.prisma.user.findFirst({ where: { id: order.technicianId }, select: { fcmTokens: true } })
          : null,
      ]);

      tokens.push(...(owner?.fcmTokens ?? []), ...(technician?.fcmTokens ?? []));

      if (tokens.length > 0) {
        await this.notifications.sendPush(
          tokens,
          `⚠️ SLA vencendo — OS ${order.code}`,
          `A OS de prioridade ${order.priority} vence em ${warningMinutes} minutos!`,
          { serviceOrderId: order.id, type: 'SLA_WARNING' },
        );
      }
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private computeSlaDeadline(priority: ServiceOrderPriority, createdAt?: Date): Date {
    const base = createdAt ?? new Date();
    const hours = SLA_HOURS[priority] ?? 48;
    return new Date(base.getTime() + hours * 3600000);
  }

  private isSlaExpired(priority: ServiceOrderPriority, createdAt: Date): boolean {
    return this.computeSlaDeadline(priority, createdAt) < new Date();
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.serviceOrder.count({
      where: { code: { startsWith: `OS-${year}-` } },
    });
    return `OS-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private assertAccess(
    order: { ownerId: string; technicianId: string | null },
    requesterId: string,
    role: UserRole,
  ): void {
    if (role === UserRole.ADMIN) return;
    if (role === UserRole.OWNER && order.ownerId !== requesterId) {
      throw new ForbiddenException('Acesso negado a esta OS.');
    }
    if (role === UserRole.TECHNICIAN && order.technicianId !== requesterId) {
      throw new ForbiddenException('Esta OS não está atribuída a você.');
    }
  }

  private validateStatusTransition(
    current: ServiceOrderStatus,
    next: ServiceOrderStatus,
    role: UserRole,
  ): void {
    const OWNER_TRANSITIONS: Partial<Record<ServiceOrderStatus, ServiceOrderStatus[]>> = {
      [ServiceOrderStatus.AWAITING_APPROVAL]: [ServiceOrderStatus.APPROVED, ServiceOrderStatus.CANCELLED],
    };
    const TECH_TRANSITIONS: Partial<Record<ServiceOrderStatus, ServiceOrderStatus[]>> = {
      [ServiceOrderStatus.ASSIGNED]: [ServiceOrderStatus.IN_PROGRESS],
      [ServiceOrderStatus.IN_PROGRESS]: [ServiceOrderStatus.AWAITING_APPROVAL],
    };

    const allowed =
      role === UserRole.OWNER
        ? OWNER_TRANSITIONS[current]
        : role === UserRole.TECHNICIAN
        ? TECH_TRANSITIONS[current]
        : Object.values(ServiceOrderStatus); // ADMIN pode tudo

    if (allowed && !allowed.includes(next)) {
      throw new BadRequestException(
        `Transição inválida: ${current} → ${next} para perfil ${role}.`,
      );
    }
  }

  // ── Salvar assinatura digital ─────────────────────────────────────────────

  async saveSignature(
    orderId: string,
    requesterId: string,
    role: UserRole,
    dto: SaveSignatureDto,
  ) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        code: true,
        ownerId: true,
        technicianId: true,
        status: true,
        report: { select: { id: true } },
      },
    });

    if (!order) throw new NotFoundException('OS não encontrada.');

    // Apenas técnico da OS ou ADMIN pode assinar
    if (role !== UserRole.ADMIN && order.technicianId !== requesterId) {
      throw new ForbiddenException('Apenas o técnico da OS pode assinar.');
    }

    // Persistir signatureUrl na OS e no laudo (se existir)
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { signatureUrl: dto.signatureUrl },
      });

      if (order.report) {
        await tx.report.update({
          where: { id: order.report.id },
          data: {
            signatureUrl: dto.signatureUrl,
            signedAt: new Date(),
            status: 'SIGNED',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: requesterId,
          action: 'SIGNATURE',
          resource: 'ServiceOrder',
          resourceId: orderId,
          newData: { signatureUrl: dto.signatureUrl },
        },
      });
    });

    this.logger.log(`Assinatura salva na OS ${order.code} por ${requesterId}`);

    return {
      serviceOrderId: orderId,
      signatureUrl: dto.signatureUrl,
      signedAt: new Date().toISOString(),
    };
  }

  private async sendStatusNotification(
    order: {
      code: string;
      id: string;
      owner: { fcmTokens: string[] };
      technician: { fcmTokens: string[]; name: string } | null;
    },
    status: ServiceOrderStatus,
  ): Promise<void> {
    const messages: Partial<Record<ServiceOrderStatus, { title: string; body: string }>> = {
      [ServiceOrderStatus.ASSIGNED]: {
        title: 'Técnico designado ✓',
        body: `Técnico atribuído à OS ${order.code}.`,
      },
      [ServiceOrderStatus.IN_PROGRESS]: {
        title: '🔧 OS em andamento',
        body: `A OS ${order.code} foi iniciada pelo técnico.`,
      },
      [ServiceOrderStatus.AWAITING_APPROVAL]: {
        title: '✅ OS concluída — aguardando aprovação',
        body: `A OS ${order.code} está aguardando sua aprovação.`,
      },
      [ServiceOrderStatus.COMPLETED]: {
        title: '🎉 OS concluída!',
        body: `A OS ${order.code} foi finalizada com sucesso.`,
      },
      [ServiceOrderStatus.CANCELLED]: {
        title: 'OS cancelada',
        body: `A OS ${order.code} foi cancelada.`,
      },
    };

    const msg = messages[status];
    if (!msg) return;

    const tokens = [
      ...order.owner.fcmTokens,
      ...(order.technician?.fcmTokens ?? []),
    ];

    if (tokens.length > 0) {
      await this.notifications.sendPush(tokens, msg.title, msg.body, {
        serviceOrderId: order.id,
        status,
      });
    }
  }
}
