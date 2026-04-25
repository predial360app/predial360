import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** POST /service-orders/:id/bodycam/start */
export class StartBodycamDto {
  @ApiProperty({
    description: 'MIME type do vídeo (mp4 recomendado)',
    example: 'video/mp4',
    default: 'video/mp4',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Codec de vídeo usado pelo dispositivo',
    example: 'H.264',
  })
  @IsOptional()
  @IsString()
  codec?: string;

  @ApiPropertyOptional({
    description: 'Resolução do vídeo',
    example: '1920x1080',
  })
  @IsOptional()
  @IsString()
  resolution?: string;
}

/** POST /service-orders/:id/bodycam/chunk */
export class BodycamChunkDto {
  @ApiProperty({ description: 'ID da gravação (retornado pelo /start)' })
  @IsUUID()
  recordingId!: string;

  @ApiProperty({
    description: 'Número do chunk (inicia em 1)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  partNumber!: number;

  @ApiProperty({
    description: 'Vídeo do chunk em base64 (até ~5 MB por chunk de 30s)',
  })
  @IsString()
  videoBase64!: string;
}

/** POST /service-orders/:id/bodycam/finish */
export class FinishBodycamDto {
  @ApiProperty({ description: 'ID da gravação (retornado pelo /start)' })
  @IsUUID()
  recordingId!: string;

  @ApiPropertyOptional({
    description: 'Duração total do vídeo em segundos',
    example: 240,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  durationSeconds?: number;

  @ApiPropertyOptional({
    description: 'Tamanho total do arquivo em bytes',
    example: 52428800,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  fileSizeBytes?: number;
}
