import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '@predial360/shared';
import { EtaService } from './eta.service';

@ApiTags('service-orders')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'service-orders', version: '1' })
export class EtaController {
  constructor(private readonly etaService: EtaService) {}

  /**
   * GET /service-orders/:id/eta
   * ETA calculado via Google Routes API com tráfego em tempo real.
   * Localização do técnico vem do Redis (TTL 90s).
   */
  @Get(':id/eta')
  @ApiOperation({
    summary: 'ETA do técnico em rota (Google Routes API)',
    description:
      'Retorna:\n' +
      '- `technicianLocation`: última posição GPS do técnico (Redis TTL 90s)\n' +
      '- `distanceMeters` e `durationSeconds`: calculados com tráfego em tempo real\n' +
      '- `technicianStatus`: EN_ROUTE | ON_SITE | IDLE | OFFLINE\n\n' +
      '**WebSocket:** conecte ao namespace `/location` e subscreva `location:subscribe` ' +
      'para atualizações em tempo real (push a cada ~15s).',
  })
  @ApiResponse({ status: 200, description: 'ETA calculado com sucesso' })
  @ApiResponse({ status: 404, description: 'OS não encontrada' })
  @ApiResponse({ status: 503, description: 'Imóvel sem coordenadas cadastradas' })
  getEta(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.etaService.computeEta(id);
  }

  /**
   * GET /service-orders/:id/tracking
   * Snapshot completo de rastreamento: localização atual + ETA + status.
   * Usado pelo app do proprietário na tela de mapa ao inicializar.
   * WebSocket mantém os dados atualizados após a primeira carga.
   */
  @Get(':id/tracking')
  @ApiOperation({
    summary: 'Snapshot de rastreamento em tempo real (localização + ETA + status)',
    description:
      '**Uso:** App do proprietário — carrega estado inicial da tela de mapa.\n\n' +
      'Após a carga inicial, use o **WebSocket** (`/location`, evento `order:location`) ' +
      'para receber atualizações em tempo real a cada ~15s.\n\n' +
      '**Alerta de proximidade:** notificação push é enviada automaticamente ' +
      'quando o técnico está a ≤500m do destino.\n\n' +
      '**Campos retornados:**\n' +
      '```\n' +
      '{ technicianLocation, destination, distanceMeters, durationSeconds,\n' +
      '  durationText, technicianStatus, lastUpdatedAt,\n' +
      '  technician: { name, avatarUrl, rating },\n' +
      '  order: { code, title, status } }\n' +
      '```',
  })
  @ApiResponse({ status: 200, description: 'Dados de rastreamento com ETA' })
  @ApiResponse({ status: 404, description: 'OS não encontrada' })
  getTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<unknown> {
    return this.etaService.getTracking(id, user.sub);
  }
}
