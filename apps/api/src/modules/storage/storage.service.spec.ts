import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageService } from './storage.service';

// ── Mock AWS SDK ──────────────────────────────────────────────────────────────

const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
  DeleteObjectCommand: jest.fn().mockImplementation((args) => args),
  GetObjectCommand: jest.fn().mockImplementation((args) => args),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://presigned-url.example.com/key'),
}));

// ── Mock ConfigService ────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, defaultVal?: string) => {
    const map: Record<string, string> = {
      'app.aws.region': 'us-east-1',
      'app.aws.s3Endpoint': 'http://localhost:4566',
      'app.aws.cdnBaseUrl': '',
      'app.aws.accessKeyId': 'test',
      'app.aws.secretAccessKey': 'test',
    };
    return map[key] ?? defaultVal;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'app.aws.s3Bucket') return 'predial360-test';
    throw new Error(`Missing: ${key}`);
  }),
};

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockS3Send.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  // ── uploadBase64 ────────────────────────────────────────────────────────────

  describe('uploadBase64', () => {
    const validBase64 = Buffer.from('fake-image-data').toString('base64');

    it('deve fazer upload de PNG e retornar URL pública', async () => {
      const url = await service.uploadBase64(validBase64, 'image/png', 'signatures');

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(url).toContain('predial360-test');
      expect(url).toContain('signatures');
    });

    it('deve aceitar base64 com prefixo data:image/png;base64,', async () => {
      const withPrefix = `data:image/png;base64,${validBase64}`;
      const url = await service.uploadBase64(withPrefix, 'image/png', 'checklists');

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(url).toBeTruthy();
    });

    it('deve usar fileName customizado quando fornecido', async () => {
      const url = await service.uploadBase64(
        validBase64,
        'image/jpeg',
        'signatures',
        'assinatura-tecnico',
      );

      expect(url).toContain('assinatura-tecnico');
    });

    it('deve lançar BadRequestException para MIME type inválido', async () => {
      await expect(
        service.uploadBase64(validBase64, 'image/gif', 'signatures'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException para arquivo maior que 10 MB', async () => {
      // Simular base64 de +10 MB
      const largeBase64 = Buffer.alloc(11 * 1024 * 1024).toString('base64');

      await expect(
        service.uploadBase64(largeBase64, 'image/jpeg', 'checklists'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar InternalServerErrorException se S3 falhar', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('S3 connection timeout'));

      await expect(
        service.uploadBase64(validBase64, 'image/png', 'signatures'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── uploadBuffer ────────────────────────────────────────────────────────────

  describe('uploadBuffer', () => {
    it('deve fazer upload de PDF e retornar URL', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 fake content');
      const url = await service.uploadBuffer(pdfBuffer, 'application/pdf', 'reports', 'relatorio-001.pdf');

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(url).toContain('reports');
      expect(url).toContain('relatorio-001.pdf');
    });
  });

  // ── getPresignedDownloadUrl ──────────────────────────────────────────────────

  describe('getPresignedDownloadUrl', () => {
    it('deve retornar URL pré-assinada temporária', async () => {
      const url = await service.getPresignedDownloadUrl('production/reports/abc.pdf');

      expect(url).toBe('https://presigned-url.example.com/key');
    });
  });

  // ── deleteObject ─────────────────────────────────────────────────────────────

  describe('deleteObject', () => {
    it('deve deletar objeto pelo URL sem lançar exceção', async () => {
      await expect(
        service.deleteObject('http://localhost:4566/predial360-test/production/signatures/abc.png'),
      ).resolves.toBeUndefined();

      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('deve ignorar graciosamente URL inválida', async () => {
      await expect(
        service.deleteObject('not-a-valid-url'),
      ).resolves.toBeUndefined();
    });

    it('deve logar warn sem relançar quando S3 falha ao deletar', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('Access denied'));

      await expect(
        service.deleteObject('http://localhost:4566/predial360-test/production/signatures/abc.png'),
      ).resolves.toBeUndefined(); // não relança
    });
  });
});
