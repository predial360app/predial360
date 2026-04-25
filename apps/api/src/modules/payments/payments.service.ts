/**
 * PaymentsService — integração com Asaas para cobranças Pix.
 * Norma: toda cobrança de serviço de manutenção deve ter nota fiscal (NBR 16747 §9).
 *
 * Fluxo Pix:
 *  1. POST /payments/pix  → cria customer no Asaas (se não existir) → cria charge
 *  2. Retorna pixQrCode (base64) e pixCopyPaste para exibição no mobile
 *  3. Asaas chama POST /payments/webhook quando pago
 *  4. Webhook → atualiza Payment + ServiceOrder → push notification ao proprietário
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { format, addDays } from 'date-fns';

import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsGateway } from '../../websocket/payments.gateway';
import type { CreatePixChargeDto, AsaasWebhookDto } from './dto/payment.dto';

// ─── Tipos Asaas ─────────────────────────────────────────────────────────────

interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
}

interface AsaasCharge {
  id: string;
  status: string;
  value: number;
  billingType: string;
  invoiceUrl: string;
  pixQrCodeId?: string;
}

interface AsaasPixQr {
  encodedImage: string;  // base64 do QR Code PNG
  payload: string;       // Pix Copia e Cola
  expirationDate: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly asaas: AxiosInstance;
  private readonly webhookToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly paymentsGateway: PaymentsGateway,
  ) {
    const apiKey = this.config.getOrThrow<string>('app.asaas.apiKey');
    const baseUrl = this.config.get<string>(
      'app.asaas.baseUrl',
      'https://sandbox.asaas.com/api/v3',
    );
    this.webhookToken = this.config.getOrThrow<string>('app.asaas.webhookToken');

    this.asaas = axios.create({
      baseURL: baseUrl,
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Predial360/1.0',
      },
      timeout: 15000,
    });
  }

  // ── POST /payments/pix ────────────────────────────────────────────────────

  async createPixCharge(requesterId: string, dto: CreatePixChargeDto) {
    // 1. Verificar OS e acesso
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: dto.serviceOrderId, deletedAt: null },
      select: {
        id: true,
        code: true,
        ownerId: true,
        status: true,
        payment: { select: { id: true, status: true } },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            cpf: true,
            asaasCustomerId: true,
            fcmTokens: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('OS não encontrada.');
    if (order.ownerId !== requesterId) throw new ForbiddenException('Acesso negado.');

    // Só cria cobrança se não houver pagamento pendente
    if (order.payment && ['PENDING', 'CONFIRMED', 'RECEIVED'].includes(order.payment.status)) {
      throw new BadRequestException(
        `Já existe uma cobrança ${order.payment.status} para esta OS.`,
      );
    }

    const owner = order.owner;

    // 2. Garantir customer no Asaas
    const asaasCustomerId = await this.upsertCustomer(owner);

    // 3. Criar cobrança Pix no Asaas
    const dueDate = dto.dueDate ?? format(addDays(new Date(), 3), 'yyyy-MM-dd');

    const { data: charge } = await this.asaas.post<AsaasCharge>('/payments', {
      customer: asaasCustomerId,
      billingType: 'PIX',
      value: dto.amountCents / 100,  // Asaas trabalha com R$, não centavos
      dueDate,
      description: dto.description,
      externalReference: order.id,   // ID interno para rastrear no webhook
      postalService: false,
    });

    // 4. Buscar QR Code Pix
    const { data: qrCode } = await this.asaas.get<AsaasPixQr>(
      `/payments/${charge.id}/pixQrCode`,
    );

    // 5. Persistir Payment no banco
    const payment = await this.prisma.payment.upsert({
      where: { serviceOrderId: order.id },
      create: {
        ownerId: owner.id,
        serviceOrderId: order.id,
        asaasPaymentId: charge.id,
        amount: dto.amountCents,
        status: 'PENDING',
        method: 'PIX',
        description: dto.description,
        dueDate: new Date(dueDate),
        pixQrCode: qrCode.encodedImage,
        pixCopyPaste: qrCode.payload,
        invoiceUrl: charge.invoiceUrl,
      },
      update: {
        asaasPaymentId: charge.id,
        amount: dto.amountCents,
        status: 'PENDING',
        dueDate: new Date(dueDate),
        pixQrCode: qrCode.encodedImage,
        pixCopyPaste: qrCode.payload,
      },
    });

    // 6. Atualizar asaasCustomerId no User (se novo)
    if (!owner.asaasCustomerId) {
      await this.prisma.user.update({
        where: { id: owner.id },
        data: { asaasCustomerId },
      });
    }

    this.logger.log(
      `Cobrança Pix criada: ${charge.id} | OS ${order.code} | R$ ${dto.amountCents / 100}`,
    );

    // 7. Notificar proprietário via push
    if (owner.fcmTokens.length > 0) {
      await this.notifications.sendPush(
        owner.fcmTokens,
        '💰 Cobrança gerada — Pix disponível',
        `OS ${order.code}: R$ ${(dto.amountCents / 100).toFixed(2).replace('.', ',')}. Toque para pagar.`,
        { serviceOrderId: order.id, paymentId: payment.id, type: 'PAYMENT_DUE' },
      );
    }

    return {
      paymentId: payment.id,
      asaasPaymentId: charge.id,
      serviceOrderId: order.id,
      amountCents: dto.amountCents,
      amountFormatted: `R$ ${(dto.amountCents / 100).toFixed(2).replace('.', ',')}`,
      status: 'PENDING',
      dueDate,
      pix: {
        qrCodeBase64: qrCode.encodedImage,
        copyPaste: qrCode.payload,
        expiresAt: qrCode.expirationDate,
      },
    };
  }

  // ── GET /payments/:id ─────────────────────────────────────────────────────

  async findByServiceOrder(serviceOrderId: string, requesterId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { serviceOrderId },
      select: {
        id: true,
        asaasPaymentId: true,
        amount: true,
        status: true,
        method: true,
        description: true,
        dueDate: true,
        paidAt: true,
        pixQrCode: true,
        pixCopyPaste: true,
        invoiceUrl: true,
        receiptUrl: true,
        serviceOrder: { select: { ownerId: true, code: true } },
      },
    });

    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.serviceOrder.ownerId !== requesterId) {
      throw new ForbiddenException('Acesso negado.');
    }

    return payment;
  }

  // ── POST /payments/webhook (Asaas → backend) ──────────────────────────────

  async handleWebhook(token: string, dto: AsaasWebhookDto): Promise<{ received: boolean }> {
    // Validar token do webhook (configurado no painel Asaas)
    if (token !== this.webhookToken) {
      throw new UnauthorizedException('Token de webhook inválido.');
    }

    this.logger.debug(`Webhook Asaas: ${dto.event} — ${dto.payment.id}`);

    const CONFIRMED_EVENTS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
    const FAILED_EVENTS = ['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'];

    if (CONFIRMED_EVENTS.includes(dto.event)) {
      await this.confirmPayment(dto.payment.id, dto.payment.paymentDate);
    } else if (FAILED_EVENTS.includes(dto.event)) {
      await this.updatePaymentStatus(dto.payment.id, dto.event);
    }

    return { received: true };
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async upsertCustomer(
    owner: { asaasCustomerId: string | null; name: string; email: string; cpf: string | null },
  ): Promise<string> {
    if (owner.asaasCustomerId) return owner.asaasCustomerId;

    // Verificar se já existe no Asaas pelo CPF
    if (owner.cpf) {
      try {
        const { data } = await this.asaas.get<{ data: AsaasCustomer[] }>(
          `/customers?cpfCnpj=${owner.cpf.replace(/\D/g, '')}`,
        );
        if (data.data.length > 0 && data.data[0]) return data.data[0].id;
      } catch {
        // Ignora — tenta criar
      }
    }

    const { data: customer } = await this.asaas.post<AsaasCustomer>('/customers', {
      name: owner.name,
      email: owner.email,
      cpfCnpj: owner.cpf?.replace(/\D/g, '') ?? '',
      notificationDisabled: false,
    });

    return customer.id;
  }

  private async confirmPayment(asaasPaymentId: string, paidAt?: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { asaasPaymentId },
      select: {
        id: true,
        serviceOrderId: true,
        serviceOrder: {
          select: {
            id: true,
            code: true,
            owner: { select: { fcmTokens: true } },
          },
        },
      },
    });

    if (!payment) {
      this.logger.warn(`Webhook: pagamento não encontrado no banco: ${asaasPaymentId}`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          paidAt: paidAt ? new Date(paidAt) : new Date(),
        },
      }),
      this.prisma.serviceOrder.update({
        where: { id: payment.serviceOrderId ?? '' },
        data: { status: 'APPROVED' },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'PAYMENT',
          resource: 'Payment',
          resourceId: payment.id,
          newData: { status: 'CONFIRMED', asaasPaymentId, paidAt },
        },
      }),
    ]);

    // Notificação push ao proprietário
    const tokens = payment.serviceOrder?.owner.fcmTokens ?? [];
    if (tokens.length > 0) {
      await this.notifications.sendPush(
        tokens,
        '✅ Pagamento confirmado!',
        `O pagamento da OS ${payment.serviceOrder?.code ?? ''} foi confirmado. O serviço está aprovado.`,
        { serviceOrderId: payment.serviceOrderId ?? '', type: 'PAYMENT_CONFIRMED' },
      );
    }

    // Emitir evento WebSocket em tempo real para o mobile do proprietário
    if (payment.serviceOrderId) {
      this.paymentsGateway.emitPaymentConfirmed(payment.serviceOrderId, payment.id);
    }

    this.logger.log(`Pagamento confirmado: ${asaasPaymentId}`);
  }

  private async updatePaymentStatus(asaasPaymentId: string, event: string): Promise<void> {
    const statusMap: Record<string, string> = {
      PAYMENT_OVERDUE: 'OVERDUE',
      PAYMENT_DELETED: 'CANCELLED',
      PAYMENT_REFUNDED: 'REFUNDED',
    };

    const newStatus = statusMap[event] ?? 'FAILED';

    await this.prisma.payment.updateMany({
      where: { asaasPaymentId },
      data: { status: newStatus as 'OVERDUE' | 'CANCELLED' | 'REFUNDED' | 'FAILED' },
    });

    this.logger.log(`Status do pagamento ${asaasPaymentId} atualizado para ${newStatus}`);
  }
}
