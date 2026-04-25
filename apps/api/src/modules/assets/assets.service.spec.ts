import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssetCategory, AssetStatus, MaintenanceFrequency, UserRole } from '@prisma/client';

import { AssetsService } from './assets.service';
import { PrismaService } from '../../database/prisma.service';

const OWNER_ID = 'owner-001';
const PROP_ID = 'prop-001';
const ASSET_ID = 'asset-001';

const mockAsset = {
  id: ASSET_ID,
  propertyId: PROP_ID,
  name: 'Painel Elétrico',
  category: AssetCategory.ELECTRICAL,
  brand: null,
  model: null,
  serialNumber: null,
  installationDate: null,
  warrantyExpiration: null,
  lastMaintenanceDate: null,
  nextMaintenanceDate: null,
  maintenanceFrequency: null,
  applicableNorms: [],
  status: AssetStatus.OPERATIONAL,
  qrCode: 'qr-uuid-001',
  iotDeviceId: null,
  notes: null,
  photoUrls: [],
  manualUrl: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  property: { ownerId: OWNER_ID },
};

const mockPrisma = {
  asset: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  property: {
    findFirst: jest.fn().mockResolvedValue({ ownerId: OWNER_ID }),
  },
};

describe('AssetsService', () => {
  let service: AssetsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar ativo com QR Code UUID gerado', async () => {
      mockPrisma.asset.create.mockResolvedValue(mockAsset);

      const result = await service.create(PROP_ID, OWNER_ID, UserRole.OWNER, {
        name: 'Painel Elétrico',
        category: AssetCategory.ELECTRICAL,
      });

      expect(mockPrisma.asset.create).toHaveBeenCalledTimes(1);
      const callData = mockPrisma.asset.create.mock.calls[0]?.[0]?.data as { qrCode: string };
      expect(callData?.qrCode).toBeDefined();
      expect(typeof callData?.qrCode).toBe('string');
      expect(result.id).toBe(ASSET_ID);
    });

    it('deve calcular nextMaintenanceDate a partir de installationDate + frequência', async () => {
      mockPrisma.asset.create.mockResolvedValue(mockAsset);

      await service.create(PROP_ID, OWNER_ID, UserRole.OWNER, {
        name: 'AC',
        category: AssetCategory.HVAC,
        installationDate: '2024-01-01',
        maintenanceFrequency: MaintenanceFrequency.QUARTERLY,
      });

      const callData = mockPrisma.asset.create.mock.calls[0]?.[0]?.data as { nextMaintenanceDate: Date };
      const expected = new Date('2024-04-01');
      expect(callData?.nextMaintenanceDate?.getTime()).toBeCloseTo(expected.getTime(), -4);
    });

    it('deve lançar ForbiddenException para proprietário sem acesso', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({ ownerId: 'outro-owner' });

      await expect(
        service.create(PROP_ID, 'intruso', UserRole.OWNER, {
          name: 'X',
          category: AssetCategory.ELECTRICAL,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('deve retornar ativo existente para o proprietário', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.findById(ASSET_ID, OWNER_ID, UserRole.OWNER);
      expect(result.id).toBe(ASSET_ID);
    });

    it('deve lançar NotFoundException para ativo inexistente', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.findById('nao-existe', OWNER_ID, UserRole.OWNER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getQrCode ─────────────────────────────────────────────────────────────

  describe('getQrCode', () => {
    it('deve retornar qrCodeDataUrl como data URL base64', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.getQrCode(ASSET_ID, OWNER_ID, UserRole.OWNER);

      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.assetId).toBe(ASSET_ID);
      expect(result.assetName).toBe('Painel Elétrico');
    });

    it('payload do QR deve ser JSON com type, id e qr', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.getQrCode(ASSET_ID, OWNER_ID, UserRole.OWNER);
      const parsed = JSON.parse(result.qrCodePayload) as { type: string; id: string; qr: string };

      expect(parsed.type).toBe('asset');
      expect(parsed.id).toBe(ASSET_ID);
      expect(parsed.qr).toBe('qr-uuid-001');
    });
  });

  // ── findByQrCode ──────────────────────────────────────────────────────────

  describe('findByQrCode', () => {
    it('deve encontrar ativo pelo QR Code', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);

      const result = await service.findByQrCode('qr-uuid-001');
      expect(result.id).toBe(ASSET_ID);
    });

    it('deve lançar NotFoundException para QR Code inválido', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.findByQrCode('invalido')).rejects.toThrow(NotFoundException);
    });
  });
});
