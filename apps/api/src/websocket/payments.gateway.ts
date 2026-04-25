/**
 * PaymentsGateway — WebSocket namespace /payments
 * ─────────────────────────────────────────────────────────────────────────────
 * Permite que o app mobile (proprietário) receba confirmação de pagamento Pix
 * em tempo real sem precisar fazer polling.
 *
 * Fluxo:
 *  1. Mobile conecta ao namespace /payments com JWT
 *  2. Emite payment:subscribe { serviceOrderId } → entra na room da OS
 *  3. Quando PaymentsService confirma pagamento, chama emitPaymentConfirmed()
 *  4. Mobile recebe payment:confirmed e exibe tela de sucesso
 *
 * Segurança: JWT verificado no handleConnection.
 */
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import type { JwtPayload } from '@predial360/shared';
import { PrismaService } from '../database/prisma.service';

interface PaymentSubscribePayload {
  serviceOrderId: string;
}

@WebSocketGateway({
  namespace: '/payments',
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:19006'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class PaymentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(PaymentsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('PaymentsGateway iniciado — namespace /payments');
  }

  // ── Conexão ─────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as { token?: string }).token ??
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) throw new WsException('Token ausente.');

      const secret = this.config.getOrThrow<string>('app.jwt.accessSecret');
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });

      // Guarda o payload do usuário no socket para uso posterior
      client.data = { userId: payload.sub, role: payload.role } as {
        userId: string;
        role: string;
      };

      this.logger.debug(`Cliente conectado: ${payload.sub} [${payload.role}]`);
    } catch {
      this.logger.warn(`Conexão recusada — token inválido: ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }

  // ── Subscrição à room de uma OS ─────────────────────────────────────────

  @SubscribeMessage('payment:subscribe')
  async handleSubscribe(
    @MessageBody() payload: PaymentSubscribePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, role } = client.data as { userId: string; role: string };
    const { serviceOrderId } = payload;

    // Verificar acesso: proprietário da OS ou ADMIN
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: serviceOrderId, deletedAt: null },
      select: { ownerId: true },
    });

    if (!order) {
      throw new WsException('OS não encontrada.');
    }

    const isOwner = order.ownerId === userId;
    const isAdmin = role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new WsException('Acesso negado a esta OS.');
    }

    const room = `payment:order:${serviceOrderId}`;
    await client.join(room);

    this.logger.debug(`${userId} subscreveu ao room ${room}`);

    return { subscribed: true, serviceOrderId };
  }

  // ── Método chamado pelo PaymentsService após confirmação ────────────────

  emitPaymentConfirmed(serviceOrderId: string, paymentId: string) {
    const room = `payment:order:${serviceOrderId}`;
    this.server.to(room).emit('payment:confirmed', {
      serviceOrderId,
      paymentId,
      confirmedAt: new Date().toISOString(),
    });
    this.logger.log(`Evento payment:confirmed emitido → room ${room}`);
  }
}
