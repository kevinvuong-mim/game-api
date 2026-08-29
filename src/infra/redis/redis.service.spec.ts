import Redis from 'ioredis';
import { GameId } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { AUTH_TOKEN_CACHE_TTL_SECONDS } from '@/common/constants';
import { REDIS_CLIENT, RedisService, createRedisClient } from '@/infra/redis/redis.service';

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    quit: jest.fn(),
  }));
  return { __esModule: true, default: MockRedis };
});

describe('createRedisClient', () => {
  it('throws when REDIS_URL is missing', () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    expect(() => createRedisClient(configService as unknown as ConfigService)).toThrow(
      'REDIS_URL is not configured',
    );
  });

  it('creates an ioredis client from REDIS_URL', () => {
    const configService = { get: jest.fn().mockReturnValue('redis://localhost:6379') };
    createRedisClient(configService as unknown as ConfigService);
    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', { maxRetriesPerRequest: null });
  });
});

describe('RedisService', () => {
  const redis = {
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    quit: jest.fn(),
  };
  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedisService(redis as unknown as Redis);
  });

  it('pings Redis and treats failures as disconnected', async () => {
    redis.ping.mockResolvedValue('PONG');
    await expect(service.ping()).resolves.toBe(true);

    redis.ping.mockRejectedValue(new Error('down'));
    await expect(service.ping()).resolves.toBe(false);
  });

  it('reads and writes auth token cache entries', async () => {
    const guest = { guestId: 'g1', gameId: GameId.FRULOOP };
    redis.get.mockResolvedValue(JSON.stringify(guest));

    await expect(service.getAuthTokenGuestId('hash')).resolves.toEqual(guest);
    expect(redis.get).toHaveBeenCalledWith('auth:token:hash');

    await service.setAuthTokenGuestId('hash', guest);
    expect(redis.set).toHaveBeenCalledWith(
      'auth:token:hash',
      JSON.stringify(guest),
      'EX',
      AUTH_TOKEN_CACHE_TTL_SECONDS,
    );
  });

  it('returns null for missing or corrupt auth cache values', async () => {
    redis.get.mockResolvedValue(null);
    await expect(service.getAuthTokenGuestId('hash')).resolves.toBeNull();

    redis.get.mockResolvedValue('{not-json');
    await expect(service.getAuthTokenGuestId('hash')).resolves.toBeNull();
  });

  it('marks rank-push sends with SET NX and clears them', async () => {
    redis.set.mockResolvedValue('OK');
    await expect(service.tryMarkRankPushSent('FRULOOP', '2026-W34', 'g1')).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'rank-push:sent:FRULOOP:2026-W34:g1',
      '1',
      'EX',
      8 * 24 * 60 * 60,
      'NX',
    );

    redis.set.mockResolvedValue(null);
    await expect(service.tryMarkRankPushSent('FRULOOP', '2026-W34', 'g1')).resolves.toBe(false);

    await service.clearRankPushSent('FRULOOP', '2026-W34', 'g1');
    expect(redis.del).toHaveBeenCalledWith('rank-push:sent:FRULOOP:2026-W34:g1');
  });

  it('allows a rate-limit consume when the lua counter is within the limit', async () => {
    redis.eval.mockResolvedValue(3);
    await expect(service.consumeRateLimit('rate:init:1.1.1.1', 3, 60)).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'rate:init:1.1.1.1', '60');

    redis.eval.mockResolvedValue(4);
    await expect(service.consumeRateLimit('rate:init:1.1.1.1', 3, 60)).resolves.toBe(false);
  });

  it('quits the client on module destroy', async () => {
    redis.quit.mockResolvedValue('OK');
    await service.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalled();
  });

  it('exports REDIS_CLIENT as the injection token', () => {
    expect(REDIS_CLIENT).toBe('REDIS_CLIENT');
  });
});
