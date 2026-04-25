import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('app.redis.url', 'redis://localhost:6379');
    const password = this.configService.get<string>('app.redis.password');

    this.client = new Redis(url, {
      password: password || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      lazyConnect: false,
    });

    this.client.on('connect', () => this.logger.log('Redis conectado.'));
    this.client.on('error', (err: Error) => this.logger.error('Erro Redis:', err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  /** Adiciona à blocklist de tokens revogados (ex-logout) */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.set(`blacklist:${jti}`, '1', ttlSeconds);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.exists(`blacklist:${jti}`);
  }

  /** Cache de OTP/TOTP temporário */
  async setOtp(userId: string, code: string, ttlSeconds = 300): Promise<void> {
    await this.set(`otp:${userId}`, code, ttlSeconds);
  }

  async getOtp(userId: string): Promise<string | null> {
    return this.get(`otp:${userId}`);
  }

  async delOtp(userId: string): Promise<void> {
    await this.del(`otp:${userId}`);
  }
}
