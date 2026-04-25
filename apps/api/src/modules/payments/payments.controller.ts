import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '@predial360/shared';
import { PaymentsService } from './payments.service';
import { AsaasWebhookDto, CreatePixChargeDto } from './dto/payment.dto';

@ApiTags('payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  // ── POST /payments/pix ────────────────────────────────────────────────────

  @Post('pix')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar cobrança Pix via Asaas',
    description:
      'Cria ou atualiza cobrança Pix para a OS especificada.\n\n' +
      'Retorna:\n' +
      '- `pix.qrCodeBase64`: imagem PNG do QR Code em base64\n' +
      '- `pix.copyPaste`: código Pix Copia e Cola\n' +
      '- `pix.expiresAt`: expiração do QR Code\n\n' +
      'O status da OS é atualizado automaticamente para `APPROVED` após confirmação.',
  })
  @ApiResponse({
    status: 201,
    description: 'Cobrança Pix criada',
    schema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string' },
        amountFormatted: { type: 'string', example: 'R$ 350,00' },
        status: { type: 'string', example: 'PENDING' },
        pix: {
          type: 'object',
          properties: {
            qrCodeBase64: { type: 'string' },
            copyPaste: { type: 'string' },
            expiresAt: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cobrança já existe para esta OS' })
  @ApiResponse({ status: 403, description: 'Apenas o proprietário da OS pode gerar cobrança' })
  createPixCharge(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePixChargeDto,
  ) {
    return this.service.createPixCharge(user.sub, dto);
  }

  // ── GET /payments/service-order/:serviceOrderId ───────────────────────────

  @Get('service-order/:serviceOrderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Consultar pagamento de uma OS',
    description:
      'Retorna os dados do pagamento vinculado à OS, incluindo QR Code Pix e status atual.',
  })
  @ApiResponse({ status: 200, description: 'Dados do pagamento' })
  @ApiResponse({ status: 404, description: 'Pagamento não encontrado' })
  findByServiceOrder(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByServiceOrder(serviceOrderId, user.sub);
  }

  // ── POST /payments/webhook ────────────────────────────────────────────────

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook Asaas (público — validado por token)',
    description:
      'Endpoint chamado pelo Asaas quando o status do pagamento muda.\n\n' +
      '**Eventos processados:**\n' +
      '- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → marca CONFIRMED, aprova OS, envia push\n' +
      '- `PAYMENT_OVERDUE` → marca OVERDUE\n' +
      '- `PAYMENT_REFUNDED` → marca REFUNDED\n' +
      '- `PAYMENT_DELETED` → marca CANCELLED\n\n' +
      '**Segurança:** token enviado no header `asaas-access-token` validado contra `ASAAS_WEBHOOK_TOKEN`.',
  })
  @ApiHeader({
    name: 'asaas-access-token',
    description: 'Token de autenticação do webhook Asaas (configurado no painel Asaas)',
    required: true,
  })
  @ApiResponse({ status: 200, schema: { properties: { received: { type: 'boolean' } } } })
  @ApiResponse({ status: 401, description: 'Token de webhook inválido' })
  handleWebhook(
    @Headers('asaas-access-token') token: string,
    @Body() dto: AsaasWebhookDto,
  ) {
    return this.service.handleWebhook(token, dto);
  }
}
