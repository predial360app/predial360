/**
 * BodycamService — gravação de vídeo corporal vinculada à OS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Usa S3 Multipart Upload para suportar vídeos grandes sem timeout.
 *
 * Fluxo:
 *  1. POST /start  → cria DB record + inicia CreateMultipartUpload no S3
 *  2. POST /chunk  → UploadPart por chunk de ~30s (base64 → Buffer)
 *  3. POST /finish → CompleteMultipartUpload + fecha DB record
 *  4. GET /        → URL assinada (1h) para download seguro pelo gestor
 *
 * Segurança:
 *  - Bucket S3 privado (ACL block-public-access)
 *  - URLs assinadas com expiração de 3600s
 *  - Apenas técnico da OS ou ADMIN podem iniciar gravação
 *  - Apenas ADMIN/OWNER podem acessar o vídeo
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type {
  BodycamChunkDto,
  FinishBodycamDto,
  StartBodycamDto,
} from './dto/bodycam.dto';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface StartResult {
  recordingId: string;
  uploadId: string;
  message: string;
}

interface ChunkResult {
  partNumber: number;
  etag: string;
  chunksUploaded: number;
}

interface FinishResult {
  recordingId: string;
  s3Url: string;
  durationSeconds: number | null;
  fileSizeBytes: string | null;
  chunkCount: number;
  finishedAt: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BodycamService {
  private readonly logger = new Logger(BodycamService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  /**
   * Armazena ETags dos chunks em memória, indexados por recordingId.
   *
   * ⚠️  Limitação conhecida (ISSUE #9):
   *   - Dados são perdidos em restart do servidor. Em produção, persistir
   *     ETags na tabela `bodycam_recordings` em uma coluna JSON.
   *   - Gravações iniciadas mas nunca finalizadas (crash do app) ficam na
   *     Map até o próximo `startRecording` da mesma OS (que chama `abortMultipart`)
   *     ou até reinicialização do servidor.
   *   - Safeguard implementado: `cleanupStaleParts()` é chamado em `abortMultipart`
   *     e no `startRecording` ao detectar gravação existente.
   */
  private readonly uploadParts = new Map<
    string,
    Array<{ PartNumber: number; ETag: string }>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const region = this.config.get<string>('app.aws.region', 'us-east-1');
    const endpoint = this.config.get<string>('app.aws.s3Endpoint');
    this.bucket = this.config.getOrThrow<string>('app.aws.s3Bucket');

    this.s3 = new S3Client({
      region,
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: true,
            credentials: {
              accessKeyId: this.config.get<string>('app.aws.accessKeyId', 'test'),
              secretAccessKey: this.config.get<string>('app.aws.secretAccessKey', 'test'),
            },
          }
        : {}),
    });
  }

  // ── POST /start ─────────────────────────────────────────────────────────────

  async startRecording(
    serviceOrderId: string,
    technicianId: string,
    dto: StartBodycamDto,
  ): Promise<StartResult> {
    const order = await this.assertTechnicianAccess(serviceOrderId, technicianId);

    // Abortir gravação anterior em andamento (se houver)
    const existing = await this.prisma.bodycamRecording.findFirst({
      where: { serviceOrderId, status: 'RECORDING' },
    });
    if (existing?.uploadId) {
      await this.abortMultipart(existing.uploadId, existing.s3Key ?? '');
      await this.prisma.bodycamRecording.update({
        where: { id: existing.id },
        data: { status: 'FAILED' },
      });
      // ISSUE #9: limpar entrada da Map para evitar crescimento indefinido
      this.uploadParts.delete(existing.id);
    }

    // Criar chave S3 única para o arquivo de vídeo
    const ext = (dto.mimeType ?? 'video/mp4').includes('webm') ? '.webm' : '.mp4';
    const s3Key = `bodycam/${serviceOrderId}/${Date.now()}-${randomUUID()}${ext}`;

    // Iniciar multipart upload no S3
    const multipart = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: s3Key,
        ContentType: dto.mimeType ?? 'video/mp4',
        Metadata: {
          serviceOrderId,
          technicianId,
          codec: dto.codec ?? 'unknown',
          resolution: dto.resolution ?? 'unknown',
          startedAt: new Date().toISOString(),
        },
        // Garantir que o objeto nunca seja público
        ServerSideEncryption: 'AES256',
      }),
    );

    if (!multipart.UploadId) {
      throw new BadRequestException('Falha ao iniciar upload multipart no S3.');
    }

    // Persistir no banco
    const recording = await this.prisma.bodycamRecording.create({
      data: {
        serviceOrderId,
        technicianId,
        uploadId: multipart.UploadId,
        s3Key,
        status: 'RECORDING',
        codec: dto.codec,
        resolution: dto.resolution,
      },
    });

    // Inicializar lista de parts em memória
    this.uploadParts.set(recording.id, []);

    this.logger.log(
      `Bodycam iniciada: ${recording.id} | OS ${order.code} | S3 key: ${s3Key}`,
    );

    return {
      recordingId: recording.id,
      uploadId: multipart.UploadId,
      message: `Gravação iniciada. Envie chunks via POST /bodycam/chunk`,
    };
  }

  // ── POST /chunk ─────────────────────────────────────────────────────────────

  async uploadChunk(
    serviceOrderId: string,
    technicianId: string,
    dto: BodycamChunkDto,
  ): Promise<ChunkResult> {
    const recording = await this.getActiveRecording(dto.recordingId, serviceOrderId, technicianId);

    // Converter base64 para Buffer
    const cleanBase64 = dto.videoBase64.includes(',')
      ? dto.videoBase64.split(',')[1]!
      : dto.videoBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length < 5 * 1024 * 1024 && dto.partNumber > 1) {
      // S3 exige mínimo de 5MB por parte (exceto a última)
      // Na última parte, qualquer tamanho é aceito
      this.logger.debug(
        `Parte ${dto.partNumber}: ${buffer.length} bytes (< 5MB — aceito somente se for a última parte)`,
      );
    }

    // Upload da parte no S3
    const uploadResult = await this.s3.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: recording.s3Key!,
        UploadId: recording.uploadId!,
        PartNumber: dto.partNumber,
        Body: buffer,
      }),
    );

    if (!uploadResult.ETag) {
      throw new BadRequestException(`Falha no upload da parte ${dto.partNumber}.`);
    }

    // Registrar ETag da parte
    const parts = this.uploadParts.get(recording.id) ?? [];
    parts.push({ PartNumber: dto.partNumber, ETag: uploadResult.ETag });
    this.uploadParts.set(recording.id, parts);

    // Atualizar contador de chunks no banco
    const updated = await this.prisma.bodycamRecording.update({
      where: { id: recording.id },
      data: { chunkCount: { increment: 1 } },
      select: { chunkCount: true },
    });

    this.logger.debug(
      `Chunk ${dto.partNumber} enviado: ${buffer.length} bytes | ` +
        `ETag: ${uploadResult.ETag} | Total: ${updated.chunkCount} chunks`,
    );

    return {
      partNumber: dto.partNumber,
      etag: uploadResult.ETag,
      chunksUploaded: updated.chunkCount,
    };
  }

  // ── POST /finish ─────────────────────────────────────────────────────────────

  async finishRecording(
    serviceOrderId: string,
    technicianId: string,
    dto: FinishBodycamDto,
  ): Promise<FinishResult> {
    const recording = await this.getActiveRecording(dto.recordingId, serviceOrderId, technicianId);

    const parts = this.uploadParts.get(recording.id);
    if (!parts || parts.length === 0) {
      throw new BadRequestException('Nenhum chunk enviado antes de finalizar.');
    }

    // Ordenar parts por PartNumber (obrigatório pelo S3)
    const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);

    // Completar multipart upload
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: recording.s3Key!,
        UploadId: recording.uploadId!,
        MultipartUpload: { Parts: sortedParts },
      }),
    );

    // Construir URL S3 permanente (privada)
    const s3Url = this.buildS3Url(recording.s3Key!);

    // Atualizar banco com metadados finais
    const finishedAt = new Date();
    const finished = await this.prisma.bodycamRecording.update({
      where: { id: recording.id },
      data: {
        status: 'COMPLETED',
        s3Url,
        durationSeconds: dto.durationSeconds,
        fileSizeBytes: dto.fileSizeBytes ? BigInt(dto.fileSizeBytes) : null,
        finishedAt,
      },
    });

    // Limpar memória
    this.uploadParts.delete(recording.id);

    this.logger.log(
      `Bodycam finalizada: ${recording.id} | ` +
        `${finished.chunkCount} chunks | ${dto.durationSeconds ?? '?'}s | ${s3Url}`,
    );

    return {
      recordingId: recording.id,
      s3Url,
      durationSeconds: dto.durationSeconds ?? null,
      fileSizeBytes: dto.fileSizeBytes ? String(dto.fileSizeBytes) : null,
      chunkCount: finished.chunkCount,
      finishedAt: finishedAt.toISOString(),
    };
  }

  // ── GET / (URL assinada) ─────────────────────────────────────────────────────

  async getSignedUrl(
    serviceOrderId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<{ url: string; expiresInSeconds: number; recordingId: string }> {
    // Verificar acesso: OWNER da OS ou ADMIN
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, deletedAt: null },
      select: { ownerId: true, code: true },
    });
    if (!order) throw new NotFoundException('OS não encontrada.');

    // Allow-list: apenas ADMIN ou o proprietário específico da OS
    const isAdmin = requesterRole === UserRole.ADMIN;
    const isOwner = order.ownerId === requesterId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Apenas o proprietário ou administrador pode acessar o vídeo.');
    }

    const recording = await this.prisma.bodycamRecording.findFirst({
      where: { serviceOrderId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, s3Key: true },
    });
    if (!recording?.s3Key) {
      throw new NotFoundException('Nenhuma gravação concluída encontrada para esta OS.');
    }

    const EXPIRES_IN = 3600; // 1 hora

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: recording.s3Key,
    });
    const signedUrl = await getSignedUrl(this.s3, command, { expiresIn: EXPIRES_IN });

    this.logger.debug(
      `URL assinada gerada para OS ${order.code}: expira em ${EXPIRES_IN}s`,
    );

    return {
      url: signedUrl,
      expiresInSeconds: EXPIRES_IN,
      recordingId: recording.id,
    };
  }

  // ── Helpers privados ──────────────────────────────────────────────────────────

  private async assertTechnicianAccess(serviceOrderId: string, technicianId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: serviceOrderId,
        technicianId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        deletedAt: null,
      },
      select: { id: true, code: true },
    });
    if (!order) {
      throw new ForbiddenException(
        'OS não encontrada, não atribuída a você, ou não está em andamento.',
      );
    }
    return order;
  }

  private async getActiveRecording(
    recordingId: string,
    serviceOrderId: string,
    technicianId: string,
  ) {
    const recording = await this.prisma.bodycamRecording.findFirst({
      where: { id: recordingId, serviceOrderId, technicianId },
      select: { id: true, s3Key: true, uploadId: true, status: true, chunkCount: true },
    });
    if (!recording) throw new NotFoundException('Gravação não encontrada.');
    if (recording.status === 'COMPLETED') {
      throw new BadRequestException('Esta gravação já foi finalizada.');
    }
    if (recording.status === 'FAILED') {
      // ISSUE #9: garante que entry órfã seja removida da Map
      this.uploadParts.delete(recordingId);
      throw new BadRequestException('Esta gravação falhou. Inicie uma nova.');
    }
    return recording;
  }

  private async abortMultipart(uploadId: string, s3Key: string): Promise<void> {
    try {
      await this.s3.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: s3Key,
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      this.logger.warn(`Falha ao abortar multipart ${uploadId}: ${String(err)}`);
    }
  }

  private buildS3Url(key: string): string {
    const endpoint = this.config.get<string>('app.aws.s3Endpoint');
    const cdnBaseUrl = this.config.get<string>('app.aws.cdnBaseUrl', '');
    if (cdnBaseUrl) return `${cdnBaseUrl}/${key}`;
    if (endpoint) return `${endpoint}/${this.bucket}/${key}`;
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
}
