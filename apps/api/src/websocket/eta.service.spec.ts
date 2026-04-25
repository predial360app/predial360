import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EtaService } from './eta.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockOrder = {
  id: 'order-001',
  technicianId: 'tech-001',
  technicianLatitude: -23.55,
  technicianLongitude: -46.63,
  property: { latitude: -23.56, longitude: -46.64 },
};

const mockPrisma = {
  serviceOrder: { findFirst: jest.fn() },
  serviceOrder_update: jest.fn(),
};

const mockRedis = {
  getJson: jest.fn(),
  setJson: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'app.google.mapsApiKey') return 'test-maps-key';
    throw new Error(`Missing: ${key}`);
  }),
};

describe('EtaService', () => {
  let service: EtaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EtaService>(EtaService);
  });

  describe('computeEta', () => {
    it('deve retornar ETA com dados do Redis (tempo real)', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(mockOrder);
      mockRedis.getJson.mockResolvedValue({
        latitude: -23.55,
        longitude: -46.63,
        timestamp: new Date().toISOString(),
        status: 'EN_ROUTE',
      });
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          routes: [{
            distanceMeters: 1500,
            duration: '300s',
            localizedValues: {
              distance: { text: '1,5 km' },
              duration: { text: '5 min' },
            },
          }],
        },
      });

      const result = await service.computeEta('order-001');

      expect(result.distanceMeters).toBe(1500);
      expect(result.durationSeconds).toBe(300);
      expect(result.durationText).toBe('5 min');
      expect(result.technicianStatus).toBe('EN_ROUTE');
    });

    it('deve usar localização do banco quando Redis está vazio (fallback)', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(mockOrder);
      mockRedis.getJson.mockResolvedValue(null); // Redis vazio
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          routes: [{
            distanceMeters: 2000,
            duration: '420s',
            localizedValues: {
              distance: { text: '2,0 km' },
              duration: { text: '7 min' },
            },
          }],
        },
      });

      const result = await service.computeEta('order-001');

      expect(result.technicianLocation).toEqual({ latitude: -23.55, longitude: -46.63 });
      expect(result.technicianStatus).toBe('IDLE');
      expect(result.distanceMeters).toBe(2000);
    });

    it('deve retornar status OFFLINE quando técnico não tem localização', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        technicianId: null,
        technicianLatitude: null,
        technicianLongitude: null,
      });

      const result = await service.computeEta('order-001');

      expect(result.technicianLocation).toBeNull();
      expect(result.technicianStatus).toBe('OFFLINE');
      expect(result.durationSeconds).toBeNull();
    });

    it('deve lançar NotFoundException para OS inexistente', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(null);

      await expect(service.computeEta('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ServiceUnavailableException se imóvel não tem coordenadas', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        property: { latitude: null, longitude: null },
      });

      await expect(service.computeEta('order-001')).rejects.toThrow(ServiceUnavailableException);
    });

    it('deve retornar null para ETA quando Google Routes API falha', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(mockOrder);
      mockRedis.getJson.mockResolvedValue({
        latitude: -23.55,
        longitude: -46.63,
        timestamp: new Date().toISOString(),
        status: 'EN_ROUTE',
      });
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.computeEta('order-001');

      // Não deve lançar — degrada graciosamente
      expect(result.durationSeconds).toBeNull();
      expect(result.technicianLocation).not.toBeNull();
    });
  });
});
