import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService } from './storage.service';
import { UploadBase64Dto } from './dto/upload.dto';

@ApiTags('storage')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'storage', version: '1' })
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * POST /storage/upload
   * Upload de arquivo em base64 (foto de checklist, assinatura digital, etc.)
   * Retorna a URL pública permanente no S3.
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('application/json')
  @ApiOperation({
    summary: 'Upload de arquivo (base64) para S3',
    description:
      'Aceita arquivo em base64 e retorna a URL pública no S3.\n\n' +
      '**Pastas disponíveis:** checklists, signatures, reports, avatars, assets, properties\n\n' +
      '**Limite:** 10 MB por arquivo.',
  })
  @ApiResponse({
    status: 201,
    description: 'Upload realizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://predial360-bucket.s3.amazonaws.com/...' },
        key: { type: 'string', example: 'production/signatures/uuid.png' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Tipo de arquivo não suportado ou tamanho excedido' })
  async uploadBase64(@Body() dto: UploadBase64Dto): Promise<{ url: string }> {
    const url = await this.storageService.uploadBase64(
      dto.base64,
      dto.mimeType,
      dto.folder,
      dto.fileName,
    );
    return { url };
  }
}
