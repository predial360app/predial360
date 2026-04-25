import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '@predial360/shared';
import { ServiceOrdersService } from './service-orders.service';
import {
  AssignTechnicianDto,
  CreateServiceOrderDto,
  SaveSignatureDto,
  UpdateServiceOrderDto,
} from './dto/service-order.dto';

@ApiTags('service-orders')
@ApiBearerAuth('JWT')
@Controller({ path: 'service-orders', version: '1' })
export class ServiceOrdersController {
  constructor(private readonly service: ServiceOrdersService) {}

  // ── POST /service-orders ──────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Criar nova Ordem de Serviço',
    description:
      'SLA automático por prioridade:\n' +
      '- EMERGENCY: 4h\n- URGENT: 12h\n- HIGH: 24h\n- MEDIUM: 48h\n- LOW: 72h\n\n' +
      'O campo `slaDeadline` é calculado e retornado na resposta.',
  })
  @ApiResponse({ status: 201, description: 'OS criada com SLA calculado' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateServiceOrderDto) {
    return this.service.create(user.sub, dto);
  }

  // ── GET /service-orders ───────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Listar OS do usuário',
    description: 'Proprietário vê suas OS; Técnico vê OS atribuídas a ele; ADMIN vê todas.',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'perPage', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY'] })
  @ApiQuery({ name: 'propertyId', required: false })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('propertyId') propertyId?: string,
  ) {
    return this.service.findAll(user.sub, user.role as UserRole, {
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 20,
      status,
      priority,
      propertyId,
    });
  }

  // ── GET /service-orders/:id ───────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes da OS com SLA, checklist e laudo' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findById(id, user.sub, user.role as UserRole);
  }

  // ── PATCH /service-orders/:id/status ─────────────────────────────────────

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Atualizar status da OS',
    description:
      'Transições válidas:\n' +
      '- OWNER: AWAITING_APPROVAL → APPROVED | CANCELLED\n' +
      '- TECHNICIAN: ASSIGNED → IN_PROGRESS → AWAITING_APPROVAL\n' +
      '- ADMIN: qualquer transição\n\n' +
      'Push notification enviado automaticamente.',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateServiceOrderDto,
  ) {
    return this.service.updateStatus(id, user.sub, user.role as UserRole, dto);
  }

  // ── POST /service-orders/:id/assign ──────────────────────────────────────

  @Post(':id/assign')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir técnico à OS (ADMIN)' })
  @ApiResponse({ status: 200 })
  assignTechnician(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.service.assignTechnician(id, user.sub, user.role as UserRole, dto);
  }

  // ── PATCH /service-orders/:id/signature ──────────────────────────────────

  @Patch(':id/signature')
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Salvar assinatura digital na OS',
    description:
      'Persiste a URL da assinatura PNG (préviamente upada em S3 via POST /storage/upload) ' +
      'na OS e no laudo vinculado. Muda status do laudo para SIGNED.\n\n' +
      '**Fluxo mobile:**\n' +
      '1. Técnico desenha assinatura no canvas\n' +
      '2. App converte para PNG base64\n' +
      '3. POST /storage/upload → obtém URL S3\n' +
      '4. PATCH /service-orders/:id/signature com a URL',
  })
  @ApiResponse({ status: 200, description: 'Assinatura salva com sucesso' })
  @ApiResponse({ status: 403, description: 'Apenas técnico da OS ou ADMIN' })
  @ApiResponse({ status: 404, description: 'OS não encontrada' })
  saveSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveSignatureDto,
  ) {
    return this.service.saveSignature(id, user.sub, user.role as UserRole, dto);
  }
}
