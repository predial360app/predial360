/**
 * bodycam.service.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests para BodycamService.
 * AWS SDK v3 é mockado com jest.fn() — sem chamadas reais ao S3.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { BodycamService } from './bodycam.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Mock AWS SDK ─────────────────────────────────────────────────────────────

const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  CreateMultipartUploadCommand: jest.fn().mockImplementation((input) => ({ input })),
  UploadPartCommand: jest.fn().mockImplementation((input) => ({ input })),
  CompleteMultipartUploadCommand: jest.fn().mockImplementation((input) => ({ input })),
  AbortMultipartUploadCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com/video.mp4?X-Amz-Expires=3600'),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVICE_ORDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TECHNICIAN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OWNER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const RECORDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const UPLOAD_ID = 'mock-upload-id-xyz';
const S3_KEY = `bodycam/${SERVICE_ORDER_ID}/1234567890-uuid.mp4`;

const mockOrder = { id: SERVICE_ORDER_ID, code: 'OS-0042' };
const mockRecording = {
  id: RECORDING_ID,
  s3Key: S3_KEY,
  uploadId: UPLOAD_ID,
  status: 'RECORDING',
  chunkCount: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildValidBase64(sizeBytes: number): string {
  // Gera buffer com sizeBytes bytes e converte para base64
  const buf = Buffer.alloc(sizeBytes, 0x42);
  return buf.toString('base64');
}

// 5 MB em base64
const CHUNK_5MB_B64 = buildValidBase64(5 * 1024 * 1024);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BodycamService', () => {
  let service: BodycamService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BodycamService,
        {
          provide: PrismaService,
          useValue: {
            serviceOrder: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            bodycamRecording: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                'app.aws.region': 'us-east-1',
                'app.aws.s3Endpoint': undefined,
                'app.aws.cdnBaseUrl': '',
              };
              return map[key] ?? def;
            }),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'app.aws.s3Bucket') return 'test-bucket';
              throw new Error(`Config key not found: ${key}`);
            }),
          },
        },
      ],
    }).compile();

    service = module.get(BodycamService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // ── startRecording ────────────────────────────────────────────────────────

  describe('startRecording()', () => {
    it('deve iniciar gravação e retornar recordingId + uploadId', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(null);
      mockS3Send.mockResolvedValue({ UploadId: UPLOAD_ID });
      (prisma.bodycamRecording.create as jest.Mock).mockResolvedValue({
        id: RECORDING_ID,
        s3Key: S3_KEY,
      });

      const result = await service.startRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        mimeType: 'video/mp4',
        codec: 'H.264',
        resolution: '1920x1080',
      });

      expect(result.recordingId).toBe(RECORDING_ID);
      expect(result.uploadId).toBe(UPLOAD_ID);
      expect(result.message).toContain('/bodycam/chunk');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('deve abortar gravação anterior em RECORDING antes de iniciar nova', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue({
        id: 'old-id',
        uploadId: 'old-upload-id',
        s3Key: 'bodycam/old.mp4',
        status: 'RECORDING',
      });
      (prisma.bodycamRecording.update as jest.Mock).mockResolvedValue({});
      // S3: first call = AbortMultipart, second = CreateMultipart
      mockS3Send
        .mockResolvedValueOnce({}) // abort
        .mockResolvedValueOnce({ UploadId: UPLOAD_ID }); // create
      (prisma.bodycamRecording.create as jest.Mock).mockResolvedValue({
        id: RECORDING_ID,
        s3Key: S3_KEY,
      });

      await service.startRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {});

      expect(mockS3Send).toHaveBeenCalledTimes(2); // abort + create
      expect(prisma.bodycamRecording.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
    });

    it('deve lançar ForbiddenException se OS não está atribuída ao técnico', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.startRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar BadRequestException se S3 não retornar UploadId', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(null);
      mockS3Send.mockResolvedValue({ UploadId: undefined }); // S3 falhou silenciosamente

      await expect(
        service.startRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve usar extensão .webm quando mimeType contém webm', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(null);
      mockS3Send.mockResolvedValue({ UploadId: UPLOAD_ID });
      (prisma.bodycamRecording.create as jest.Mock).mockResolvedValue({
        id: RECORDING_ID,
        s3Key: `bodycam/${SERVICE_ORDER_ID}/something.webm`,
      });

      await service.startRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        mimeType: 'video/webm;codecs=vp9',
      });

      const createCall = (prisma.bodycamRecording.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.s3Key).toMatch(/\.webm$/);
    });
  });

  // ── uploadChunk ───────────────────────────────────────────────────────────

  describe('uploadChunk()', () => {
    beforeEach(() => {
      // Simula gravação ativa na memória
      (service as unknown as { uploadParts: Map<string, unknown[]> }).uploadParts.set(RECORDING_ID, []);
    });

    it('deve fazer upload de chunk e retornar etag + chunksUploaded', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);
      mockS3Send.mockResolvedValue({ ETag: '"etag-part-1"' });
      (prisma.bodycamRecording.update as jest.Mock).mockResolvedValue({ chunkCount: 1 });

      const result = await service.uploadChunk(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        recordingId: RECORDING_ID,
        partNumber: 1,
        videoBase64: CHUNK_5MB_B64,
      });

      expect(result.partNumber).toBe(1);
      expect(result.etag).toBe('"etag-part-1"');
      expect(result.chunksUploaded).toBe(1);
    });

    it('deve remover prefixo data: do base64 antes de converter', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);
      mockS3Send.mockResolvedValue({ ETag: '"etag-1"' });
      (prisma.bodycamRecording.update as jest.Mock).mockResolvedValue({ chunkCount: 1 });

      const base64WithPrefix = `data:video/mp4;base64,${CHUNK_5MB_B64}`;
      await service.uploadChunk(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        recordingId: RECORDING_ID,
        partNumber: 1,
        videoBase64: base64WithPrefix,
      });

      // Não deve lançar erro
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('deve lançar BadRequestException se ETag não retornado pelo S3', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);
      mockS3Send.mockResolvedValue({ ETag: undefined });

      await expect(
        service.uploadChunk(SERVICE_ORDER_ID, TECHNICIAN_ID, {
          recordingId: RECORDING_ID,
          partNumber: 1,
          videoBase64: CHUNK_5MB_B64,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se gravação já foi COMPLETED', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue({
        ...mockRecording,
        status: 'COMPLETED',
      });

      await expect(
        service.uploadChunk(SERVICE_ORDER_ID, TECHNICIAN_ID, {
          recordingId: RECORDING_ID,
          partNumber: 1,
          videoBase64: CHUNK_5MB_B64,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se gravação não encontrada', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.uploadChunk(SERVICE_ORDER_ID, TECHNICIAN_ID, {
          recordingId: RECORDING_ID,
          partNumber: 1,
          videoBase64: CHUNK_5MB_B64,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── finishRecording ───────────────────────────────────────────────────────

  describe('finishRecording()', () => {
    const parts = [
      { PartNumber: 2, ETag: '"etag-2"' },
      { PartNumber: 1, ETag: '"etag-1"' }, // fora de ordem — deve ser ordenado
    ];

    beforeEach(() => {
      (service as unknown as { uploadParts: Map<string, unknown[]> }).uploadParts.set(RECORDING_ID, parts);
    });

    it('deve finalizar gravação ordenando parts e completar multipart no S3', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);
      mockS3Send.mockResolvedValue({});
      (prisma.bodycamRecording.update as jest.Mock).mockResolvedValue({
        chunkCount: 2,
      });

      const result = await service.finishRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        recordingId: RECORDING_ID,
        durationSeconds: 120,
        fileSizeBytes: 10485760,
      });

      expect(result.recordingId).toBe(RECORDING_ID);
      expect(result.durationSeconds).toBe(120);
      expect(result.chunkCount).toBe(2);
      expect(result.s3Url).toContain('s3.amazonaws.com');
      expect(mockS3Send).toHaveBeenCalledTimes(1); // CompleteMultipartUpload

      // Verifica ordenação das partes enviadas ao S3
      const completeCall = mockS3Send.mock.calls[0][0];
      const sentParts = (completeCall as { input: { MultipartUpload: { Parts: Array<{ PartNumber: number }> } } }).input.MultipartUpload.Parts;
      expect(sentParts[0].PartNumber).toBe(1);
      expect(sentParts[1].PartNumber).toBe(2);
    });

    it('deve limpar uploadParts da memória após finalizar', async () => {
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);
      mockS3Send.mockResolvedValue({});
      (prisma.bodycamRecording.update as jest.Mock).mockResolvedValue({ chunkCount: 2 });

      await service.finishRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        recordingId: RECORDING_ID,
      });

      const internalMap = (service as unknown as { uploadParts: Map<string, unknown> }).uploadParts;
      expect(internalMap.has(RECORDING_ID)).toBe(false);
    });

    it('deve lançar BadRequestException se não houver chunks em memória', async () => {
      (service as unknown as { uploadParts: Map<string, unknown[]> }).uploadParts.delete(RECORDING_ID);
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);

      await expect(
        service.finishRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {
          recordingId: RECORDING_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getSignedUrl ──────────────────────────────────────────────────────────

  describe('getSignedUrl()', () => {
    it('deve retornar URL assinada para o proprietário da OS', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ownerId: OWNER_ID,
        code: 'OS-0042',
      });
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue({
        id: RECORDING_ID,
        s3Key: S3_KEY,
      });

      const result = await service.getSignedUrl(SERVICE_ORDER_ID, OWNER_ID, 'OWNER');

      expect(result.url).toContain('signed-url.example.com');
      expect(result.expiresInSeconds).toBe(3600);
      expect(result.recordingId).toBe(RECORDING_ID);
    });

    it('deve permitir acesso ADMIN independente do ownerId', async () => {
      const ADMIN_ID = 'admin-id-xxxx';
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ownerId: OWNER_ID,
        code: 'OS-0042',
      });
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue({
        id: RECORDING_ID,
        s3Key: S3_KEY,
      });

      const result = await service.getSignedUrl(SERVICE_ORDER_ID, ADMIN_ID, 'ADMIN');
      expect(result.url).toBeTruthy();
    });

    it('deve lançar ForbiddenException para usuário sem acesso', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ownerId: OWNER_ID,
        code: 'OS-0042',
      });

      await expect(
        service.getSignedUrl(SERVICE_ORDER_ID, 'random-user-id', 'OWNER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException se OS não encontrada', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getSignedUrl(SERVICE_ORDER_ID, OWNER_ID, 'OWNER'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se não houver gravação COMPLETED', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ownerId: OWNER_ID,
        code: 'OS-0042',
      });
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getSignedUrl(SERVICE_ORDER_ID, OWNER_ID, 'OWNER'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── buildS3Url (via finishRecording) ─────────────────────────────────────

  describe('buildS3Url()', () => {
    it('deve usar cdnBaseUrl quando configurado', async () => {
      // Recria service com cdnBaseUrl configurado
      const moduleWithCdn: TestingModule = await Test.createTestingModule({
        providers: [
          BodycamService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                const map: Record<string, unknown> = {
                  'app.aws.region': 'us-east-1',
                  'app.aws.s3Endpoint': undefined,
                  'app.aws.cdnBaseUrl': 'https://cdn.example.com',
                };
                return map[key] ?? def;
              }),
              getOrThrow: jest.fn(() => 'test-bucket'),
            },
          },
        ],
      }).compile();

      const svcWithCdn = moduleWithCdn.get(BodycamService);
      (svcWithCdn as unknown as { uploadParts: Map<string, unknown[]> }).uploadParts.set(RECORDING_ID, [
        { PartNumber: 1, ETag: '"etag-1"' },
      ]);
      (prisma.bodycamRecording.findFirst as jest.Mock).mockResolvedValue(mockRecording);
      mockS3Send.mockResolvedValue({});
      (prisma.bodycamRecording.update as jest.Mock).mockResolvedValue({ chunkCount: 1 });

      const result = await svcWithCdn.finishRecording(SERVICE_ORDER_ID, TECHNICIAN_ID, {
        recordingId: RECORDING_ID,
      });

      expect(result.s3Url).toMatch(/^https:\/\/cdn\.example\.com\//);
    });
  });
});
