/**
 * StorageService — upload para S3 / LocalStack via AWS SDK v3.
 * Suporta: base64 (fotos/assinaturas mobile) e Buffer (geração server-side).
 * Bucket: STORAGE_BUCKET_NAME (env).
 * LocalStack: endpoint customizado em desenvolvimento.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export type StorageFolder =
  | 'checklists'
  | 'signatures'
  | 'reports'
  | 'avatars'
  | 'assets'
  | 'properties';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('app.aws.region', 'us-east-1');
    const endpoint = this.config.get<string>('app.aws.s3Endpoint'); // LocalStack

    this.bucket = this.config.getOrThrow<string>('app.aws.s3Bucket');
    this.cdnBaseUrl = this.config.get<string>('app.aws.cdnBaseUrl', '');

    this.s3 = new S3Client({
      region,
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: true, // LocalStack exige
            credentials: {
              accessKeyId: this.config.get<string>('app.aws.accessKeyId', 'test'),
              secretAccessKey: this.config.get<string>('app.aws.secretAccessKey', 'test'),
            },
          }
        : {}),
    });
  }

  // ── Upload via base64 (mobile) ────────────────────────────────────────────

  async uploadBase64(
    base64: string,
    mimeType: string,
    folder: StorageFolder,
    customFileName?: string,
  ): Promise<string> {
    const ext = ALLOWED_MIME_TYPES[mimeType];
    if (!ext) {
      throw new BadRequestException(`Tipo de arquivo não suportado: ${mimeType}`);
    }

    // Remove prefixo data:image/jpeg;base64, se presente
    const cleanBase64 = (base64.includes(',') ? base64.split(',')[1] : base64) ?? base64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException(`Arquivo excede o limite de ${MAX_SIZE_BYTES / 1024 / 1024} MB.`);
    }

    const key = this.buildKey(folder, customFileName ?? `${randomUUID()}${ext}`);
    return this.putObject(key, buffer, mimeType);
  }

  // ── Upload via Buffer (geração server-side: PDF, etc.) ───────────────────

  async uploadBuffer(
    buffer: Buffer,
    mimeType: string,
    folder: StorageFolder,
    fileName: string,
  ): Promise<string> {
    const key = this.buildKey(folder, fileName);
    return this.putObject(key, buffer, mimeType);
  }

  // ── Presigned URL para download temporário ───────────────────────────────

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteObject(url: string): Promise<void> {
    const key = this.urlToKey(url);
    if (!key) return;

    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.logger.debug(`Objeto deletado: ${key}`);
    } catch (err) {
      this.logger.warn(`Falha ao deletar objeto ${key}: ${String(err)}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildKey(folder: StorageFolder, fileName: string): string {
    const env = process.env.NODE_ENV ?? 'development';
    return `${env}/${folder}/${fileName}`;
  }

  private async putObject(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'max-age=31536000', // 1 ano para assets imutáveis
        }),
      );

      this.logger.debug(`Upload concluído: ${key} (${buffer.length} bytes)`);
      return this.buildPublicUrl(key);
    } catch (err) {
      this.logger.error(`Falha no upload para S3: ${String(err)}`);
      throw new InternalServerErrorException('Falha ao enviar arquivo para armazenamento.');
    }
  }

  private buildPublicUrl(key: string): string {
    if (this.cdnBaseUrl) {
      return `${this.cdnBaseUrl}/${key}`;
    }
    // LocalStack / S3 path-style
    const endpoint = this.config.get<string>('app.aws.s3Endpoint');
    if (endpoint) {
      return `${endpoint}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  /** Extrai a key S3 a partir de uma URL pública */
  private urlToKey(url: string): string | null {
    try {
      const path = new URL(url).pathname;
      // Remove /bucket/ do início se path-style
      const withoutBucket = path.replace(`/${this.bucket}/`, '');
      return withoutBucket.startsWith('/') ? withoutBucket.slice(1) : withoutBucket;
    } catch {
      return null;
    }
  }
}
