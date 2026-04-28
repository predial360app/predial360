import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import type { JwtPayload } from '@predial360/shared';
import type {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  Enable2FaResponseDto,
} from './dto/auth.dto';
import type { GoogleUser } from './strategies/google.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  // ── Registro ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { cpf: dto.cpf }] },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'E-mail já cadastrado.' : 'CPF já cadastrado.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        cpf: dto.cpf,
        role: dto.role,
        status: UserStatus.ACTIVE, // Em produção: PENDING_VERIFICATION + email
        consentGivenAt: new Date(),
      },
    });

    this.logger.log(`Novo usuário registrado: ${user.email} [${user.role}]`);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        resource: 'User',
        resourceId: user.id,
        newData: { email: user.email, role: user.role },
      },
    });

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`Conta ${user.status.toLowerCase()}. Contate o suporte.`);
    }

    // Verificar 2FA se ativo
    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException('Código 2FA obrigatório.');
      }
      await this.verifyTotpCode(user.id, user.twoFactorSecret, dto.totpCode);
    }

    this.logger.log(`Login: ${user.email} [${ipAddress ?? 'IP desconhecido'}]`);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        resource: 'User',
        resourceId: user.id,
        ipAddress,
        userAgent,
      },
    });

    return this.generateTokens(user.id, user.email, user.role, ipAddress, userAgent);
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    rawRefreshToken: string,
  ): Promise<AuthResponseDto> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: { userId, tokenHash, revokedAt: null },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    // Revogar o token atual (rotação)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
    );
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(jti: string, userId: string): Promise<void> {
    const accessExpires = this.parseExpiresIn(
      this.configService.get<string>('app.jwt.accessExpiresIn', '15m'),
    );

    await Promise.all([
      // Blacklist do access token
      this.redisService.blacklistToken(jti, accessExpires),
      // Revogar todos os refresh tokens do usuário
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.prisma.auditLog.create({
      data: { userId, action: 'LOGOUT', resource: 'User', resourceId: userId },
    });
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────

  async loginWithGoogle(googleUser: GoogleUser): Promise<AuthResponseDto> {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: googleUser.googleId }, { email: googleUser.email }] },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.googleId,
          avatarUrl: googleUser.avatarUrl,
          passwordHash: await bcrypt.hash(uuidv4(), this.BCRYPT_ROUNDS),
          role: UserRole.OWNER,
          status: UserStatus.ACTIVE,
          consentGivenAt: new Date(),
        },
      });
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId, avatarUrl: googleUser.avatarUrl },
      });
    }

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ── 2FA ─────────────────────────────────────────────────────────────────────

  async enable2fa(userId: string): Promise<Enable2FaResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA já está ativo.');
    }

    const secret = speakeasy.generateSecret({
      name: `${this.configService.get<string>('app.totp.appName')} (${user.email})`,
      length: 32,
    });

    // Criptografar o secret antes de salvar
    const encryptedSecret = this.encryptSecret(secret.base32);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptedSecret },
    });

    const otpauthUrl = secret.otpauth_url ?? '';
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return { otpauthUrl: qrCodeDataUrl, secret: secret.base32 };
  }

  async confirm2fa(userId: string, totpCode: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user.twoFactorSecret) {
      throw new BadRequestException('Inicie o processo de ativação do 2FA primeiro.');
    }

    const decryptedSecret = this.decryptSecret(user.twoFactorSecret);
    const isValid = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      throw new UnauthorizedException('Código 2FA inválido.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  async disable2fa(userId: string, totpCode: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA não está ativo.');
    }

    await this.verifyTotpCode(userId, user.twoFactorSecret, totpCode);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const jti = uuidv4();
    const accessExpiresIn = this.configService.get<string>('app.jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('app.jwt.refreshExpiresIn', '30d');

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, email, role: role as unknown as import('@predial360/shared').UserRole, jti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('app.jwt.accessSecret'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(
        { sub: userId, email, role, jti: uuidv4() },
        {
          secret: this.configService.getOrThrow<string>('app.jwt.refreshSecret'),
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    const refreshExpiresSecs = this.parseExpiresIn(refreshExpiresIn);
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        jti,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + refreshExpiresSecs * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresIn(accessExpiresIn),
      tokenType: 'Bearer',
    };
  }

  private async verifyTotpCode(
    _userId: string,
    encryptedSecret: string | null,
    code: string,
  ): Promise<void> {
    if (!encryptedSecret) throw new UnauthorizedException('2FA não configurado.');

    const secret = this.decryptSecret(encryptedSecret);
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) throw new UnauthorizedException('Código 2FA inválido.');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private encryptSecret(plaintext: string): string {
    const key = Buffer.from(
      this.configService.getOrThrow<string>('app.encryption.key'),
      'hex',
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptSecret(ciphertext: string): string {
    const [ivHex, encHex] = ciphertext.split(':');
    if (!ivHex || !encHex) throw new Error('Formato de secret inválido.');
    const key = Buffer.from(
      this.configService.getOrThrow<string>('app.encryption.key'),
      'hex',
    );
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private parseExpiresIn(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 900;
    const num = parseInt(match[1]!, 10);
    const unit = match[2]!;
    const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * (multiplier[unit] ?? 1);
  }
}
