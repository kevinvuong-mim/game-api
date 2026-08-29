import {
  HttpStatus,
  HttpException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { GameId } from '@prisma/client';
import { Reflector } from '@nestjs/core';

import type { RedisService } from '@/infra/redis/redis.service';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '@/common/decorators';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const redisService = { consumeRateLimit: jest.fn() };
  let guard: RateLimitGuard;

  const ipOptions: RateLimitOptions = {
    limit: 3,
    keyPrefix: 'rate:init:',
    windowSeconds: 60,
    keySource: 'ip',
  };
  const guestOptions: RateLimitOptions = {
    limit: 10,
    keyPrefix: 'rate:name:',
    windowSeconds: 60,
    keySource: 'guest',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RateLimitGuard(
      reflector as unknown as Reflector,
      redisService as unknown as RedisService,
    );
  });

  it('allows the request when no rate-limit metadata is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(redisService.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('consumes an IP window using request.ip', async () => {
    reflector.getAllAndOverride.mockReturnValue(ipOptions);
    redisService.consumeRateLimit.mockResolvedValue(true);

    await expect(guard.canActivate(createContext({ ip: '1.2.3.4' }))).resolves.toBe(true);
    expect(redisService.consumeRateLimit).toHaveBeenCalledWith('rate:init:1.2.3.4', 3, 60);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(RATE_LIMIT_KEY, expect.any(Array));
  });

  it('consumes a guest window using the authenticated guest id', async () => {
    reflector.getAllAndOverride.mockReturnValue(guestOptions);
    redisService.consumeRateLimit.mockResolvedValue(true);

    await expect(
      guard.canActivate(createContext({ user: { guestId: 'g1', gameId: GameId.FRULOOP } })),
    ).resolves.toBe(true);
    expect(redisService.consumeRateLimit).toHaveBeenCalledWith('rate:name:g1', 10, 60);
  });

  it('rejects guest-keyed limits without authentication', async () => {
    reflector.getAllAndOverride.mockReturnValue(guestOptions);

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses unknown when request.ip is missing or empty', async () => {
    reflector.getAllAndOverride.mockReturnValue(ipOptions);
    redisService.consumeRateLimit.mockResolvedValue(true);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(redisService.consumeRateLimit).toHaveBeenCalledWith('rate:init:unknown', 3, 60);

    await expect(guard.canActivate(createContext({ ip: '' }))).resolves.toBe(true);
    expect(redisService.consumeRateLimit).toHaveBeenCalledWith('rate:init:unknown', 3, 60);
  });

  it('returns 429 when the window is exhausted', async () => {
    reflector.getAllAndOverride.mockReturnValue(ipOptions);
    redisService.consumeRateLimit.mockResolvedValue(false);

    await expect(guard.canActivate(createContext({ ip: '1.1.1.1' }))).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('fails closed with 503 when Redis is down', async () => {
    reflector.getAllAndOverride.mockReturnValue(ipOptions);
    redisService.consumeRateLimit.mockRejectedValue(new Error('down'));

    await expect(guard.canActivate(createContext({ ip: '1.1.1.1' }))).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });

  it('requires every listed window to pass', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      ipOptions,
      { ...ipOptions, keyPrefix: 'rate:init:h:', windowSeconds: 3600, limit: 15 },
    ]);
    redisService.consumeRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(guard.canActivate(createContext({ ip: '9.9.9.9' }))).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(redisService.consumeRateLimit).toHaveBeenCalledTimes(2);
  });
});
