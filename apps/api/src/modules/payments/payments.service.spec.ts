import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentsService } from './payments.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsGateway } from '../../websocket/payments.gateway';

// ── Mock Axios ────────────────────────────────────────────────────────────────

jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => mockAxiosInstance),
      isAxiosError: jest.fn(),
    },
    ...{ _mockInstance: mockAxiosInstance },
  };
});

import axios from 'axios';
const mockAxiosInstance = (axios as unknown as { _mockInstance: { get: jest.Mock; post: jest.Mock } })._mockInstance;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-001';
const ORDER_ID = 'order-001';
const ASAAS_PAYMENT_ID = 'pay_asaas_001';
const WEBHOOK_TOKEN = 'secret-webhook-token';

const mockOrder = {
  id: ORDER_ID,
  code: 'OS-2024-00001',
  ownerId: OWNER_ID,
  status: 'AWAITING_APPROVAL',
  payment: null,
  owner: {
    id: OWNER_ID,
    name: 'João Silva',
    email: 'joao@exemplo.com',
    cpf: '123.456.789-00',
    asaasCustomerId: null,
    fcmTokens: ['token-fcm-1'],
  },
};

const mockPrisma = {
  serviceOrder: {
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn((ops) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
};

const mockNotifications = {
  sendPush: jest.fn().mockResolvedValue(undefined),
};

const mockPaymentsGateway = {
  emitPaymentConfirmed: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'app.asaas.apiKey') return 'test-asaas-key';
    if (key === 'app.asaas.webhookToken') return WEBHOOK_TOKEN;
    throw new Error(`Missing: ${key}`);
  }),
  get: jest.fn((key: string, def?: string) => {
    if (key === 'app.asaas.baseUrl') return 'https://sandbox.asaas.com/api/v3';
    return def;
  }),
};

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Defaults Asaas mocks
    mockAxiosInstance.post
      .mockResolvedValueOnce({                           // POST /customers
        data: { id: 'cus_asaas_001', name: 'João Silva' },
      })
      .mockResolvedValueOnce({                           // POST /payments
        data: {
          id: ASAAS_PAYMENT_ID,
          status: 'PENDING',
          value: 350,
          billingType: 'PIX',
          invoiceUrl: 'https://asaas.com/invoice/pay_001',
        },
      });

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        encodedImage: 'base64-qrcode-png',
        payload: '00020101021226...',
        expirationDate: '2024-06-20T23:59:59',
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PaymentsGateway, useValue: mockPaymentsGateway },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  // ── createPixCharge ─────────────────────────────────────────────────────────

  describe('createPixCharge', () => {
    const dto = {
      serviceOrderId: ORDER_ID,
      amountCents: 35000,
      description: 'Manutenção preventiva — OS-2024-00001',
    };

    beforeEach(() => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.payment.upsert.mockResolvedValue({
        id: 'payment-local-001',
        asaasPaymentId: ASAAS_PAYMENT_ID,
        amount: 35000,
        status: 'PENDING',
      });
      mockPrisma.user.update.mockResolvedValue({});
    });

    it('deve criar cobrança Pix e retornar QR Code', async () => {
      const result = await service.createPixCharge(OWNER_ID, dto);

      expect(result.pix.qrCodeBase64).toBe('base64-qrcode-png');
      expect(result.pix.copyPaste).toContain('00020101');
      expect(result.amountFormatted).toBe('R$ 350,00');
      expect(result.status).toBe('PENDING');
      expect(mockNotifications.sendPush).toHaveBeenCalledTimes(1);
    });

    it('deve lançar NotFoundException se OS não existir', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(null);

      await expect(service.createPixCharge(OWNER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se requester não é o proprietário', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue(mockOrder);

      await expect(service.createPixCharge('outro-usuario', dto)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar BadRequestException se já existe cobrança PENDING', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        payment: { id: 'pay-001', status: 'PENDING' },
      });

      await expect(service.createPixCharge(OWNER_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('deve reutilizar asaasCustomerId existente sem criar novo customer', async () => {
      mockPrisma.serviceOrder.findFirst.mockResolvedValue({
        ...mockOrder,
        owner: { ...mockOrder.owner, asaasCustomerId: 'cus_existente' },
      });

      await service.createPixCharge(OWNER_ID, dto);

      // POST /customers não deve ter sido chamado (asaasCustomerId existente)
      // A primeira chamada POST deve ser /payments, não /customers
      const firstPostCall = mockAxiosInstance.post.mock.calls[0];
      expect(firstPostCall?.[0]).toBe('/payments');
    });
  });

  // ── handleWebhook ────────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    const mockPaymentRecord = {
      id: 'payment-local-001',
      serviceOrderId: ORDER_ID,
      serviceOrder: {
        id: ORDER_ID,
        code: 'OS-2024-00001',
        owner: { fcmTokens: ['token-fcm-1'] },
      },
    };

    it('deve confirmar pagamento e enviar push para PAYMENT_CONFIRMED', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPaymentRecord);
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.serviceOrder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.handleWebhook(WEBHOOK_TOKEN, {
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: ASAAS_PAYMENT_ID,
          status: 'CONFIRMED',
          value: 350,
          billingType: 'PIX',
          paymentDate: '2024-06-18',
        },
      });

      expect(result.received).toBe(true);
      expect(mockNotifications.sendPush).toHaveBeenCalledTimes(1);
      expect(mockNotifications.sendPush).toHaveBeenCalledWith(
        ['token-fcm-1'],
        expect.stringContaining('confirmado'),
        expect.any(String),
        expect.objectContaining({ type: 'PAYMENT_CONFIRMED' }),
      );
    });

    it('deve processar PAYMENT_OVERDUE e marcar como OVERDUE', async () => {
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.handleWebhook(WEBHOOK_TOKEN, {
        event: 'PAYMENT_OVERDUE',
        payment: {
          id: ASAAS_PAYMENT_ID,
          status: 'OVERDUE',
          value: 350,
          billingType: 'PIX',
        },
      });

      expect(result.received).toBe(true);
      expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
        where: { asaasPaymentId: ASAAS_PAYMENT_ID },
        data: { status: 'OVERDUE' },
      });
    });

    it('deve lançar UnauthorizedException para token inválido', async () => {
      await expect(
        service.handleWebhook('token-errado', {
          event: 'PAYMENT_CONFIRMED',
          payment: { id: ASAAS_PAYMENT_ID, status: 'CONFIRMED', value: 350, billingType: 'PIX' },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve logar warn e retornar normally quando pagamento não existe no banco', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.handleWebhook(WEBHOOK_TOKEN, {
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'pay_desconhecido', status: 'CONFIRMED', value: 100, billingType: 'PIX' },
      });

      expect(result.received).toBe(true);
      // Não deve ter lançado exceção
    });

    it('deve emitir evento WebSocket após confirmar pagamento', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(mockPaymentRecord);
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.serviceOrder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      await service.handleWebhook(WEBHOOK_TOKEN, {
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: ASAAS_PAYMENT_ID,
          status: 'RECEIVED',
          value: 350,
          billingType: 'PIX',
        },
      });

      expect(mockPaymentsGateway.emitPaymentConfirmed).toHaveBeenCalledWith(
        ORDER_ID,
        mockPaymentRecord.id,
      );
    });
  });

  // ── findByServiceOrder ────────────────────────────────────────────────────────

  describe('findByServiceOrder', () => {
    it('deve retornar dados do pagamento para o proprietário', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'payment-001',
        status: 'PENDING',
        amount: 35000,
        pixCopyPaste: '00020101...',
        serviceOrder: { ownerId: OWNER_ID, code: 'OS-2024-00001' },
      });

      const result = await service.findByServiceOrder(ORDER_ID, OWNER_ID);
      expect(result.status).toBe('PENDING');
    });

    it('deve lançar NotFoundException se pagamento não existe', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.findByServiceOrder(ORDER_ID, OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se requester não é o proprietário', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'payment-001',
        status: 'PENDING',
        serviceOrder: { ownerId: 'outro-dono', code: 'OS-001' },
      });

      await expect(
        service.findByServiceOrder(ORDER_ID, OWNER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
