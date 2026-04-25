import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '@predial360/shared';
import { BodycamService } from './bodycam.service';
import { BodycamChunkDto, FinishBodycamDto, StartBodycamDto } from './dto/bodycam.dto';

@ApiTags('bodycam')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'service-orders/:serviceOrderId/bodycam', version: '1' })
export class BodycamController {
  constructor(private readonly bodycamService: BodycamService) {}

  /**
   * POST /service-orders/:serviceOrderId/bodycam/start
   * Inicia gravação bodycam: cria registro no banco + multipart upload no S3.
   * Apenas o técnico atribuído à OS pode iniciar.
   */
  @Post('start')
  @ApiOperation({
    summary: 'Inicia gravação bodycam (multipart upload S3)',
    description:
      '**Fluxo:**\n' +
      '1. Chame `/start` → receba `recordingId` e `uploadId`\n' +
      '2. Envie chunks base64 a cada ~30s via `/chunk`\n' +
      '3. Chame `/finish` ao encerrar a gravação\n\n' +
      '**Segurança:** apenas o técnico da OS pode iniciar. ' +
      'Gravações anteriores em andamento são abortadas automaticamente.\n\n' +
      '**Armazenamento:** S3 privado com Server-Side Encryption (AES256).',
  })
  @ApiResponse({ status: 201, description: 'Gravação iniciada com sucesso' })
  @ApiResponse({ status: 403, description: 'OS não atribuída a você ou não está em andamento' })
  startRecording(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartBodycamDto,
  ) {
    return this.bodycamService.startRecording(serviceOrderId, user.sub, dto);
  }

  /**
   * POST /service-orders/:serviceOrderId/bodycam/chunk
   * Envia um chunk de vídeo (base64) como parte do multipart upload.
   * partNumber deve iniciar em 1 e ser sequencial.
   */
  @Post('chunk')
  @ApiOperation({
    summary: 'Envia chunk de vídeo (base64) para o S3',
    description:
      'Cada chunk deve ter **mínimo 5 MB** (exceto o último).\n\n' +
      'Recomendado: ~30s de vídeo por chunk (~5-10 MB com H.264).\n\n' +
      '`partNumber` deve começar em **1** e ser incrementado a cada chunk.\n\n' +
      'Retorna `etag` e `chunksUploaded` para controle do app.',
  })
  @ApiResponse({ status: 201, description: 'Chunk enviado com sucesso' })
  @ApiResponse({ status: 400, description: 'Gravação já finalizada ou parâmetros inválidos' })
  @ApiResponse({ status: 404, description: 'Gravação não encontrada' })
  uploadChunk(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: BodycamChunkDto,
  ) {
    return this.bodycamService.uploadChunk(serviceOrderId, user.sub, dto);
  }

  /**
   * POST /service-orders/:serviceOrderId/bodycam/finish
   * Finaliza o multipart upload: concatena todas as partes no S3 e fecha o registro.
   */
  @Post('finish')
  @ApiOperation({
    summary: 'Finaliza gravação bodycam e completa o multipart upload no S3',
    description:
      'Chame **após enviar todos os chunks**.\n\n' +
      'Ordena automaticamente as partes por `partNumber` e chama ' +
      '`CompleteMultipartUpload` no S3.\n\n' +
      'Após finalizar, o vídeo é acessível somente via URL assinada (`GET /`).\n\n' +
      '**Campos opcionais:** `durationSeconds` e `fileSizeBytes` — ' +
      'use os valores medidos pelo app para auditoria.',
  })
  @ApiResponse({ status: 201, description: 'Gravação finalizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Nenhum chunk enviado ou gravação já finalizada' })
  @ApiResponse({ status: 404, description: 'Gravação não encontrada' })
  finishRecording(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: FinishBodycamDto,
  ) {
    return this.bodycamService.finishRecording(serviceOrderId, user.sub, dto);
  }

  /**
   * GET /service-orders/:serviceOrderId/bodycam
   * Retorna URL assinada (1h) para download do vídeo mais recente.
   * Acessível por OWNER da OS ou ADMIN.
   */
  @Get()
  @ApiOperation({
    summary: 'URL assinada (1h) para acesso ao vídeo bodycam',
    description:
      '**Acesso:** proprietário da OS (`OWNER`) ou administrador (`ADMIN`).\n\n' +
      'Retorna URL pré-assinada do S3 com **expiração de 1 hora**.\n\n' +
      '**Privacidade:** o bucket S3 é privado — nunca exponha `s3Url` direto. ' +
      'Use sempre esta URL assinada para reprodução segura.\n\n' +
      'Retorna a gravação **mais recente** com status `COMPLETED`.',
  })
  @ApiResponse({ status: 200, description: 'URL assinada gerada com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado — apenas proprietário ou admin' })
  @ApiResponse({ status: 404, description: 'Nenhuma gravação concluída encontrada para esta OS' })
  getSignedUrl(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bodycamService.getSignedUrl(serviceOrderId, user.sub, user.role);
  }
}
