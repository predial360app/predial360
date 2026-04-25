import { IsString, IsIn, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadBase64Dto {
  @ApiProperty({
    description: 'Conteúdo do arquivo em base64 (com ou sem prefixo data:...)',
    example: 'iVBORw0KGgoAAAANSUhEUgAA...',
  })
  @IsString()
  @MinLength(10)
  base64!: string;

  @ApiProperty({
    description: 'MIME type do arquivo',
    enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    example: 'image/png',
  })
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  mimeType!: string;

  @ApiProperty({
    description: 'Pasta de destino no S3',
    enum: ['checklists', 'signatures', 'reports', 'avatars', 'assets', 'properties'],
    example: 'signatures',
  })
  @IsString()
  @IsIn(['checklists', 'signatures', 'reports', 'avatars', 'assets', 'properties'])
  folder!: 'checklists' | 'signatures' | 'reports' | 'avatars' | 'assets' | 'properties';

  @ApiPropertyOptional({
    description: 'Nome customizado do arquivo (sem extensão)',
    example: 'assinatura-tecnico-ordem-123',
  })
  @IsOptional()
  @IsString()
  fileName?: string;
}
