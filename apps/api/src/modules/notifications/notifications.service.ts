import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

import { PrismaService } from '../../database/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly firebaseApp: admin.app.App;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Inicializar Firebase Admin (singleton)
    if (!admin.apps.length) {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.configService.get<string>('app.firebase.projectId'),
          clientEmail: this.configService.get<string>('app.firebase.clientEmail'),
          privateKey: this.configService.get<string>('app.firebase.privateKey'),
        }),
      });
    } else {
      this.firebaseApp = admin.apps[0]!;
    }
  }

  /** Envia push notification via FCM para múltiplos tokens */
  async sendPush(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!tokens.length) return;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      data: data ? Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ) : undefined,
      android: {
        notification: {
          channelId: 'predial360-alerts',
          priority: 'high',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 },
        },
      },
    };

    try {
      const response = await this.firebaseApp.messaging().sendEachForMulticast(message);
      this.logger.log(
        `Push enviado: ${response.successCount} sucesso(s), ${response.failureCount} falha(s)`,
      );

      // Remover tokens inválidos automaticamente
      const invalidTokens = response.responses
        .map((r, i) => (r.success ? null : tokens[i]))
        .filter((t): t is string => t !== null && t !== undefined);

      if (invalidTokens.length > 0) {
        await this.removeInvalidTokens(invalidTokens);
      }
    } catch (err) {
      this.logger.error('Erro ao enviar push:', err instanceof Error ? err.message : err);
    }
  }

  /** Persiste notificação no banco (histórico) */
  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data ? (data as Record<string, string>) : undefined,
      },
    });
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  async findByUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async removeInvalidTokens(tokens: string[]): Promise<void> {
    await this.prisma.user.updateMany({
      where: { fcmTokens: { hasSome: tokens } },
      data: {
        fcmTokens: {
          set: [],
        },
      },
    });
    this.logger.warn(`Tokens FCM inválidos removidos: ${tokens.join(', ')}`);
  }
}
