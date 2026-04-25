import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PropertyType, UserRole } from '@prisma/client';

import { PropertiesService } from './properties.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-uuid-001';
const PROP_ID = 'prop-uuid-001';

const mockProperty = {
  id: PROP_ID,
  ownerId: OWNER_ID,
  name: 'Apto Teste',
  type: PropertyType.RESIDENTIAL,
  description: null,
  street: 'Rua A',
  number: '1',
  complement: null,
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01001-000',
  country: 'BR',
  latitude: null,
  longitude: null,
  buildingAge: 10,
  totalArea: null,
  floors: null,
  units: null,
  registrationNumber: null,
  habitaseNumber: null,
  constructionYear: null,
  photoUrls: [],
  documentUrls: [],
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  assets: [],
  contracts: [],
  _count: { serviceOrders: 0 },
};

const mockPrisma = {
  property: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  asset: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  serviceOrder: {
    count: jest.fn().mockResolvedValue(0),
  },
  contract: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
};

const mockRedis = {
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PropertiesService', () => {
  let service: PropertiesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar um imóvel e retorná-lo', async () => {
      mockPrisma.property.create.mockResolvedValue(mockProperty);

      const result = await service.create(OWNER_ID, {
        name: 'Apto Teste',
        type: PropertyType.RESIDENTIAL,
        street: 'Rua A',
        number: '1',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000',
      });

      expect(mockPrisma.property.create).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('Apto Teste');
      expect(result.ownerId).toBe(OWNER_ID);
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('deve retornar imóvel com healthScore para o proprietário correto', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      const result = await service.findById(PROP_ID, OWNER_ID, UserRole.OWNER);

      expect(result).toHaveProperty('healthScore');
      expect(result.healthScore.score).toBeGreaterThanOrEqual(0);
      expect(result.healthScore.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.healthScore.grade);
    });

    it('deve lançar NotFoundException para ID inexistente', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);

      await expect(
        service.findById('nao-existe', OWNER_ID, UserRole.OWNER),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException para proprietário errado', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      await expect(
        service.findById(PROP_ID, 'outro-owner', UserRole.OWNER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN deve ter acesso a qualquer imóvel', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      const result = await service.findById(PROP_ID, 'qualquer-id', UserRole.ADMIN);
      expect(result).toHaveProperty('id', PROP_ID);
    });
  });

  // ── computeHealthScore ────────────────────────────────────────────────────

  describe('computeHealthScore', () => {
    it('deve retornar cache Redis quando disponível', async () => {
      const cachedScore = { score: 85, grade: 'B', breakdown: {}, alerts: [] };
      mockRedis.getJson.mockResolvedValueOnce(cachedScore);

      const result = await service.computeHealthScore(PROP_ID);
      expect(result).toEqual(cachedScore);
      expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
    });

    it('deve penalizar edificações com manutenções vencidas', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          status: 'OPERATIONAL',
          nextMaintenanceDate: new Date('2020-01-01'), // vencida!
        },
      ]);

      const result = await service.computeHealthScore(PROP_ID);
      expect(result.alerts.some((a) => a.includes('vencida'))).toBe(true);
    });

    it('deve dar nota A para imóvel perfeito', async () => {
      mockRedis.getJson.mockResolvedValue(null);
      mockPrisma.asset.findMany.mockResolvedValue([]);
      mockPrisma.serviceOrder.count.mockResolvedValue(0);
      mockPrisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });

      const result = await service.computeHealthScore(PROP_ID, {
        ...mockProperty,
        buildingAge: 2,
      } as never);

      expect(result.grade).toBe('A');
      expect(result.alerts).toHaveLength(0);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deve fazer soft-delete do imóvel', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
      mockPrisma.property.update.mockResolvedValue({ ...mockProperty, deletedAt: new Date() });

      await service.remove(PROP_ID, OWNER_ID, UserRole.OWNER);

      expect(mockPrisma.property.update).toHaveBeenCalledWith({
        where: { id: PROP_ID },
        data: { deletedAt: expect.any(Date) as Date },
      });
    });

    it('deve lançar ForbiddenException para proprietário errado', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(mockProperty);

      await expect(
        service.remove(PROP_ID, 'outro-owner', UserRole.OWNER),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
