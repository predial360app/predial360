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
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/create-property.dto';

@ApiTags('properties')
@ApiBearerAuth('JWT')
@Controller({ path: 'properties', version: '1' })
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  // ── POST /properties ───────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cadastrar novo imóvel com perfil técnico completo' })
  @ApiResponse({ status: 201, description: 'Imóvel criado com sucesso' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  // ── GET /properties ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar imóveis do proprietário (ou todos para ADMIN)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['RESIDENTIAL', 'CLINIC', 'COMMERCE', 'MIXED'] })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('type') type?: string,
  ) {
    return this.service.findAll(user.sub, user.role as UserRole, {
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 20,
      search,
      city,
      type,
    });
  }

  // ── GET /properties/:id ────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Detalhes do imóvel + health score + lista de ativos',
    description: 'Health score calculado em tempo real com cache Redis (5 min).',
  })
  @ApiResponse({ status: 200, description: 'Imóvel com health score e ativos' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Imóvel não encontrado' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findById(id, user.sub, user.role as UserRole);
  }

  // ── PATCH /properties/:id ─────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados do imóvel' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.service.update(id, user.sub, user.role as UserRole, dto);
  }

  // ── DELETE /properties/:id ────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft-delete do imóvel (somente ADMIN)' })
  @ApiResponse({ status: 204 })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.service.remove(id, user.sub, user.role as UserRole);
  }
}
