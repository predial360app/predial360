import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-123',
  email: 'test@predial360.com',
  passwordHash: '',
  name: 'Teste',
  phone: '(11) 99999-0000',
  cpf: '123.456.789-09',
  role: UserRole.OWNER,
  status: UserStatus.ACTIVE,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  googleId: null,
  appleId: null,
  avatarUrl: null,
  crea: null,
  specialties: [],
  availableForCall: false,
  rating: null,
  totalServices: 0,
  lastLatitude: null,
  lastLongitude: null,
  lastLocationAt: null,
  fcmTokens: [],
  asaasCustomerId: null,
  consentGivenAt: new Date(),
  dataRetentionDays: 1825,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockRedisService = {
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
};

const mockConfigService = {
  get: jest.fn((key: string, def?: string) => {
    const config: Record<string, string> = {
      'app.jwt.accessSecret': 'test-access-secret-64-chars-long-minimum-test-access-secret',
      'app.jwt.refreshSecret': 'test-refresh-secret-64-chars-long-minimum-test-refresh',
      'app.jwt.accessExpiresIn': '15m',
      'app.jwt.refreshExpiresIn': '30d',
      'app.totp.appName': 'Predial360',
      'app.encryption.key': 'a'.repeat(64),
    };
    return config[key] ?? def;
  }),
  getOrThrow: jest.fn((key: string) => {
    const config: Record<string, string> = {
      'app.jwt.accessSecret': 'test-access-secret-64-chars-long-minimum-test-access-secret',
      'app.jwt.refreshSecret': 'test-refresh-secret-64-chars-long-minimum-test-refresh',
      'app.encryption.key': 'a'.repeat(64),
    };
    const value = config[key];
    if (!value) throw new Error(`Config missing: ${key}`);
    return value;
  }),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Hash real para testes
    mockUser.passwordHash = await bcrypt.hash('Senha@123!', 12);
  });

  describe('register', () => {
    it('deve criar um novo usuário e retornar tokens', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.auditLog.create.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        name: 'Teste',
        email: 'test@predial360.com',
        password: 'Senha@123!',
        phone: '(11) 99999-0000',
        cpf: '123.456.789-09',
        role: UserRole.OWNER,
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tokenType).toBe('Bearer');
    });

    it('deve lançar ConflictException se e-mail já existe', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.register({
          name: 'Teste',
          email: 'test@predial360.com',
          password: 'Senha@123!',
          phone: '(11) 99999-0000',
          cpf: '123.456.789-09',
          role: UserRole.OWNER,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('deve autenticar com credenciais corretas', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.auditLog.create.mockResolvedValue({});
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'test@predial360.com',
        password: 'Senha@123!',
      });

      expect(result).toHaveProperty('accessToken');
    });

    it('deve lançar UnauthorizedException com senha errada', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@predial360.com', password: 'SenhaErrada!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException se usuário não existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'naoexiste@email.com', password: 'Senha@123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve exigir código 2FA quando ativo', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-secret',
      });

      await expect(
        service.login({ email: 'test@predial360.com', password: 'Senha@123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('deve blacklistar o JTI e revogar refresh tokens', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.auditLog.create.mockResolvedValue({});

      await service.logout('jti-test', 'user-123');

      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith('jti-test', expect.any(Number));
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
