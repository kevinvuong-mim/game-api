import Redis from 'ioredis';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthenticatedGuest } from '@/common/decorators/guest.decorator';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const REDIS_KEYS = {
  authToken: (tokenHash: string) => `auth:token:${tokenHash}`,
  leaderboard: (gameId: string) => `leaderboard:${gameId}`,
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
    const ttl = Number(process.env.AUTH_TOKEN_CACHE_TTL ?? 300);
    await this.redis.set(REDIS_KEYS.authToken(tokenHash), JSON.stringify(guest), 'EX', ttl);
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    return count <= limit;
  }

  async getLeaderboardCount(gameId: string): Promise<number> {
    return this.redis.zcard(REDIS_KEYS.leaderboard(gameId));
  }

  async getLeaderboardTop(gameId: string, offset: number, limit: number) {
    const key = REDIS_KEYS.leaderboard(gameId);
    const results = await this.redis.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');

    const entries: Array<{ guestId: string; bestScore: number; rank: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      entries.push({
        guestId: results[i],
        bestScore: Number(results[i + 1]),
        rank: offset + i / 2 + 1,
      });
    }

    return entries;
  }

  async getLeaderboardRank(gameId: string, guestId: string) {
    const key = REDIS_KEYS.leaderboard(gameId);
    const score = await this.redis.zscore(key, guestId);

    if (score === null) {
      return null;
    }

    const rank = await this.redis.zrevrank(key, guestId);
    if (rank === null) {
      return null;
    }

    return {
      rank: rank + 1,
      bestScore: Number(score),
    };
  }

  async updateLeaderboardScore(gameId: string, guestId: string, bestScore: number): Promise<void> {
    const key = REDIS_KEYS.leaderboard(gameId);
    const maxEntries = Number(process.env.LEADERBOARD_CACHE_MAX ?? 1000);

    await this.redis.zadd(key, bestScore, guestId);
    await this.redis.zremrangebyrank(key, 0, -(maxEntries + 1));
  }

  async rebuildLeaderboard(
    gameId: string,
    entries: Array<{ guestId: string; bestScore: number }>,
  ): Promise<void> {
    const key = REDIS_KEYS.leaderboard(gameId);
    await this.redis.del(key);

    if (entries.length === 0) {
      return;
    }

    const args: Array<string | number> = [];
    for (const entry of entries) {
      args.push(entry.bestScore, entry.guestId);
    }

    const maxEntries = Number(process.env.LEADERBOARD_CACHE_MAX ?? 1000);
    const capped = entries.slice(0, maxEntries);
    const cappedArgs: Array<string | number> = [];
    for (const entry of capped) {
      cappedArgs.push(entry.bestScore, entry.guestId);
    }

    await this.redis.zadd(key, ...cappedArgs);
  }
}

export function createRedisClient(configService: ConfigService) {
  const url = configService.get<string>('REDIS_URL');
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  return new Redis(url, { maxRetriesPerRequest: null });
}
