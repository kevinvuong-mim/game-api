import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

import { AUTH_TOKEN_CACHE_TTL_SECONDS } from '@/common/constants';
import type { AuthenticatedGuest } from '@/common/decorators/guest.decorator';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const REDIS_KEYS = {
  authToken: (tokenHash: string) => `auth:token:${tokenHash}`,
  notificationMuted: (gameId: string, guestId: string) => `notification:muted:${gameId}:${guestId}`,
} as const;

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async getAuthTokenGuestId(tokenHash: string): Promise<AuthenticatedGuest | null> {
    const raw = await this.redis.get(REDIS_KEYS.authToken(tokenHash));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthenticatedGuest;
    } catch {
      return null;
    }
  }

  async setAuthTokenGuestId(tokenHash: string, guest: AuthenticatedGuest): Promise<void> {
    await this.redis.set(
      REDIS_KEYS.authToken(tokenHash),
      JSON.stringify(guest),
      'EX',
      AUTH_TOKEN_CACHE_TTL_SECONDS,
    );
  }

  async setNotificationMuted(gameId: string, guestId: string, muted: boolean): Promise<void> {
    const key = REDIS_KEYS.notificationMuted(gameId, guestId);
    if (muted) {
      await this.redis.set(key, '1');
      return;
    }
    await this.redis.del(key);
  }

  async isNotificationMuted(gameId: string, guestId: string): Promise<boolean> {
    const key = REDIS_KEYS.notificationMuted(gameId, guestId);
    return (await this.redis.exists(key)) === 1;
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    return count <= limit;
  }
}

export function createRedisClient(configService: ConfigService) {
  const url = configService.get<string>('REDIS_URL');
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  return new Redis(url, { maxRetriesPerRequest: null });
}
