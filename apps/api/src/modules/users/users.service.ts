import { Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus, type User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

type SafeUser = Omit<User, 'passwordHash' | 'twoFactorSecret'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveById(id: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, status: UserStatus.ACTIVE, deletedAt: null },
    });
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, twoFactorSecret, ...safe } = user;
    return safe as SafeUser;
  }

  async findByIdOrThrow(id: string): Promise<SafeUser> {
    const user = await this.findActiveById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async updateFcmToken(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const tokens = new Set(user.fcmTokens);
    tokens.add(token);
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: [...tokens].slice(-5) }, // máx 5 dispositivos
    });
  }

  async updateLocation(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastLocationAt: new Date(),
      },
    });
  }

  /** Soft-delete LGPD — anonimiza dados pessoais */
  async anonymize(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Usuário Removido',
        email: `deleted-${userId}@predial360.internal`,
        phone: null,
        cpf: null,
        avatarUrl: null,
        googleId: null,
        appleId: null,
        fcmTokens: [],
        deletedAt: new Date(),
      },
    });
  }
}
