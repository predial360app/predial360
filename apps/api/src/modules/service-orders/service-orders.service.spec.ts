import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderType,
  UserRole,
} from '@prisma/client';

import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-001';
const TECH_ID = 'tech-001';
const ORDER_ID = 'order-001';
const PROP_ID = 'prop-001';

const makeOrder = (overrides = {}) => ({
  id: ORDER_ID,
  code: 'OS-2024-00001',
  propertyId: PROP_ID,
  ownerId: OWNER_ID,
  technicianId: TECH_ID,
  assetId: null,
  type: ServiceOrderType.PREVENTIVE,
  status: ServiceOrderStatus.PENDING,
  priority: ServiceOrderPriority.MEDIUM,
  title: 'Manutenção preventiva',
  description: 'Descrição detalhada da OS',
  applicableNorms: [],
  scheduledDate: null,
  startedAt: null,
  completedAt: null,
  estimatedDurationMinutes: 120,
  actualDurationMinutes: null,
  estimatedCost: null,
  finalCost: null,
  ownerNotes: null,
  technicianNotes: null,
  technicianLatitude: null,
  technicianLongitude: null,
  photoUrls: [],
  videoUrls: [],
  signatureUrl: null,
  rating: null,
  ratingComment: null,
  ratedAt: null,
  aiComplianceScore: null,
  aiRiskLevel: null,
  aiAnalysisJson: null,
  aiAnalyzedAt: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date(),
  property: { name: 'Apto Teste', city: 'SP', state: 'SP' },
  owner: { name: 'João', fcmTokens: ['token-owner'] },
  technician: { name: 'Carlos', fcmTokens: ['token-tech'] },
  checklist: null,
  report: null,
  payment: null,
  ...overrides,
});

const mockPrisma = {
  serviceOrder: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  property: {
    findFirst: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const mockNotifications = {
  sendPush: jest.fn().mockResolvedValue(undefined),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ServiceOrdersService', () => {
  let service: ServiceOrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ServiceOrdersService>(ServiceOrdersService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar OS com SLA calculado corretamente', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({ id: PROP_ID, ownerId: OWNER_ID });
      mockPrisma.serviceOrder.count.mockResolvedValue(0);
      mockPrisma.serviceOrder.create.mockResolvedValue(makeOrder());
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(OWNER_ID, {
        propertyId: PROP_ID,
        type: ServiceOrderType.PREVENTIVE,
        priority: ServiceOrderPriority.MEDIUM,
        title: 'Manutenção preventiva',
        description: 'Descrição detalhada',
      });

      expect(result).toHaveProperty('slaDeadline');
      expect(result.slaDeadline).toBeInstanceOf(Date);
      // MEDIUM = 48h
      const expectedDiff = 48 * 3600 * 1000;
      expect(result.slaDeadline.getTime() - result.createdAt.getTime()).toBeCloseTo(
        expectedDiff,
        -4,
      );
    });

    it('deve gerar código sequencial OS-YYYY-NNNNN', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({ id: PROP_ID, ownerId: OWNER_ID });
      mockPrisma.serviceOrder.count.mockResolvedValue(42);
      mockPrisma.serviceOrder.create.mockResolvedValue(makeOrder({ code: 'OS-2024-00043' }));
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(OWNER_ID, {
        propertyId: PROP_ID,
        type: ServiceOrderType.PREVENTIVE,
        priority: ServiceOrderPriority.LOW,
        title: 'OS teste',
        description: 'Descrição teste',
      });

      const createCall = mockPrisma.serviceOrder.create.mock.calls[0]?.[0]?.data as { code: string };
      expect(createCall.code).toMatch(/^OS-\d{4}-\d{5}$/);
    });

    it('deve lançar ForbiddenException se proprietário não é dono do imóvel', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({ id: PROP_ID, ownerId: 'outro-owner' });

      await expect(
        service.create(OWNER_ID, {
          propertyId: PROP_ID,
          type: ServiceOrderType.PREVENTIVE,
          priority: ServiceOrderPriority.MEDIUM,
          title: 'Test',
          description: 'Test description',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException se imóvel não existe', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);

      await expect(
        service.create(OWNER_ID, {
          propertyId: 'nao-existe',
          type: ServiceOrderType.CORRECTIVE,
          priority: ServiceOrderPriority.HIGH,
          title: 'Test',
          description: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── SLA ───────────────────────────────────────────────────────────────────

  describe('SLA', () => {
    const slaHoursMap: Array<[ServiceOrderPriority, number]> = [
      [ServiceOrderPriority.EMERGENCY, 4],
      [ServiceOrderPriority.URGENT, 12],
      [ServiceOrderPriority.HIGH, 24],
      [ServiceOrderPriority.MEDIUM, 48],
      [ServiceOrderPriority.LOW, 72],
    ];

    it.each(slaHoursMap)(
      'priority %s deve ter SLA de %d horas',
      async (priority, expectedHours) => {
        const base = new Date('2024-01-01T00:00:00Z');
        mockPrisma.property.findFirst.mockResolvedValue({ id: PROP_ID, ownerId: OWNER_ID });
        mockPrisma.serviceOrder.count.mockResolvedValue(0);
        mockPrisma.serviceOrder.create.mockResolvedValue(makeOrder({ priority, createdAt: base }));
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await service.create(OWNER_ID, {
          propertyId: PROP_ID,
          type: ServiceOrderType.EMERGENCY,
          priority,
          title: 'Test SLA',
          description: 'Test',
        });

        const diffHours =
          (result.slaDeadline.getTime() - result.createdAt.getTime()) / 3600000;
        expect(diffHours).toBe(expectedHours);
      },
    );
  });

  // ── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('técnico pode mover ASSIGNED → IN_PROGRESS', async () => {
      const order = makeOrder({ status: ServiceOrderStatus.ASSIGNED, technicianId: TECH_ID });
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(order);
      mockPrisma.serviceOrder.update.mockResolvedValue({
        ...order,
        status: ServiceOrderStatus.IN_PROGRESS,
        owner: { fcmTokens: [] },
        technician: { fcmTokens: [], name: 'Carlos' },
      });

      const result = await service.updateStatus(ORDER_ID, TECH_ID, UserRole.TECHNICIAN, {
        status: ServiceOrderStatus.IN_PROGRESS,
      });

      expect(result.status).toBe(ServiceOrderStatus.IN_PROGRESS);
    });

    it('técnico não pode mover IN_PROGRESS → COMPLETED (inválido)', async () => {
      const order = makeOrder({ status: ServiceOrderStatus.IN_PROGRESS, technicianId: TECH_ID });
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(order);

      await expect(
        service.updateStatus(ORDER_ID, TECH_ID, UserRole.TECHNICIAN, {
          status: ServiceOrderStatus.COMPLETED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('proprietário pode aprovar OS em AWAITING_APPROVAL', async () => {
      const order = makeOrder({ status: ServiceOrderStatus.AWAITING_APPROVAL, ownerId: OWNER_ID });
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(order);
      mockPrisma.serviceOrder.update.mockResolvedValue({
        ...order,
        status: ServiceOrderStatus.APPROVED,
        owner: { fcmTokens: [] },
        technician: { fcmTokens: [], name: 'Carlos' },
      });

      const result = await service.updateStatus(ORDER_ID, OWNER_ID, UserRole.OWNER, {
        status: ServiceOrderStatus.APPROVED,
      });

      expect(result.status).toBe(ServiceOrderStatus.APPROVED);
    });
  });

  // ── checkSlaBreach ────────────────────────────────────────────────────────

  describe('checkSlaBreach (cron)', () => {
    it('deve notificar quando há OS com SLA próximo do vencimento', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: ORDER_ID,
          code: 'OS-2024-00001',
          priority: 'EMERGENCY',
          ownerId: OWNER_ID,
          technicianId: TECH_ID,
          createdAt: new Date(),
        },
      ]);
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({ fcmTokens: ['owner-token'] })
        .mockResolvedValueOnce({ fcmTokens: ['tech-token'] });

      await service.checkSlaBreach();

      expect(mockNotifications.sendPush).toHaveBeenCalledWith(
        expect.arrayContaining(['owner-token', 'tech-token']),
        expect.stringContaining('SLA vencendo'),
        expect.any(String),
        expect.objectContaining({ type: 'SLA_WARNING' }),
      );
    });

    it('não deve notificar quando não há OS em risco', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.checkSlaBreach();

      expect(mockNotifications.sendPush).not.toHaveBeenCalled();
    });
  });
});
