import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '@predial360/shared';
import { AssetsService } from './assets.service';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';

@ApiTags('assets')
@ApiBearerAuth('JWT')
@Controller({ version: '1' })
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  // ── POST /properties/:propertyId/assets ────────────────────────────────────

  @Post('properties/:propertyId/assets')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Adicionar ativo/sistema ao imóvel' })
  @ApiResponse({ status: 201, description: 'Ativo criado com QR Code UUID gerado' })
  create(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAssetDto,
  ) {
    return this.service.create(propertyId, user.sub, user.role as UserRole, dto);
  }

  // ── GET /properties/:propertyId/assets ─────────────────────────────────────

  @Get('properties/:propertyId/assets')
  @ApiOperation({ summary: 'Listar ativos do imóvel' })
  @ApiQuery({ name: 'category', required: false, description: 'Filtrar por categoria' })
  findByProperty(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
  ) {
    return this.service.findByProperty(propertyId, user.sub, user.role as UserRole, category);
  }

  // ── GET /assets/:id ────────────────────────────────────────────────────────

  @Get('assets/:id')
  @ApiOperation({ summary: 'Detalhes de um ativo' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findById(id, user.sub, user.role as UserRole);
  }

  // ── GET /assets/:id/qrcode ────────────────────────────────────────────────

  @Get('assets/:id/qrcode')
  @ApiOperation({
    summary: 'Gerar QR Code do ativo (data URL PNG)',
    description:
      'Retorna JSON com `qrCodeDataUrl` (base64 PNG) e `qrCodePayload` (deep link JSON).\n\n' +
      'O QR contém: `{ type: "asset", id: "<uuid>", qr: "<uuid>" }`.',
  })
  @ApiResponse({ status: 200, description: 'QR Code gerado' })
  getQrCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getQrCode(id, user.sub, user.role as UserRole);
  }

  // ── GET /assets/scan/:qrCode ──────────────────────────────────────────────

  @Get('assets/scan/:qrCode')
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Escanear QR Code → histórico do ativo',
    description: 'Usado pelo técnico para identificar o ativo pelo QR Code escaneado.',
  })
  scanQrCode(@Param('qrCode') qrCode: string) {
    return this.service.findByQrCode(qrCode);
  }

  // ── PATCH /assets/:id ─────────────────────────────────────────────────────

  @Patch('assets/:id')
  @ApiOperation({ summary: 'Atualizar dados do ativo' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.service.update(id, user.sub, user.role as UserRole, dto);
  }

  // ── DELETE /assets/:id ────────────────────────────────────────────────────

  @Delete('assets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remover ativo (soft-delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.service.remove(id, user.sub, user.role as UserRole);
  }
}
