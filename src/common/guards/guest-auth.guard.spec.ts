import { GameId } from '@prisma/client';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import { hashSecretToken } from '@/common/utils';
import type { RedisService } from '@/infra/redis/redis.service';
import { GuestAuthGuard } from '@/common/guards/guest-auth.guard';
import type { GuestRepository } from '@/features/guest/guest.repository';

function createContext(authorization?: string): ExecutionContext {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('GuestAuthGuard', () => {
  const redisService = {
    getAuthTokenGuestId: jest.fn(),
    setAuthTokenGuestId: jest.fn(),
  };
  const guestRepository = {
    findByAuthTokenHash: jest.fn(),
  };
  let guard: GuestAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new GuestAuthGuard(
      redisService as unknown as RedisService,
      guestRepository as unknown as GuestRepository,
    );
  });

  it('rejects missing or empty bearer tokens', async () => {
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(createContext('Basic abc'))).rejects.toThrow(
      'Bearer token required',
    );
    await expect(guard.canActivate(createContext('Bearer   '))).rejects.toThrow(
      'Bearer token required',
    );
  });

  it('uses the cached guest when Redis has a hit', async () => {
    const cached = { guestId: 'g1', gameId: GameId.FRULOOP };
    redisService.getAuthTokenGuestId.mockResolvedValue(cached);
    const ctx = createContext('Bearer secret-token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toEqual(cached);
    expect(guestRepository.findByAuthTokenHash).not.toHaveBeenCalled();
  });

  it('loads the guest from the database and caches it on a miss', async () => {
    redisService.getAuthTokenGuestId.mockResolvedValue(null);
    guestRepository.findByAuthTokenHash.mockResolvedValue({
      id: 'g1',
      gameId: GameId.MEMORA,
    });
    const ctx = createContext('Bearer secret-token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(guestRepository.findByAuthTokenHash).toHaveBeenCalledWith(
      hashSecretToken('secret-token'),
    );
    expect(redisService.setAuthTokenGuestId).toHaveBeenCalledWith(hashSecretToken('secret-token'), {
      guestId: 'g1',
      gameId: GameId.MEMORA,
    });
    expect(ctx.switchToHttp().getRequest().user).toEqual({
      guestId: 'g1',
      gameId: GameId.MEMORA,
    });
  });

  it('rejects unknown tokens', async () => {
    redisService.getAuthTokenGuestId.mockResolvedValue(null);
    guestRepository.findByAuthTokenHash.mockResolvedValue(null);

    await expect(guard.canActivate(createContext('Bearer nope'))).rejects.toThrow('Invalid token');
  });

  it('falls back to the database when Redis read fails', async () => {
    redisService.getAuthTokenGuestId.mockRejectedValue(new Error('down'));
    guestRepository.findByAuthTokenHash.mockResolvedValue({
      id: 'g1',
      gameId: GameId.FRULOOP,
    });

    await expect(guard.canActivate(createContext('Bearer secret-token'))).resolves.toBe(true);
  });

  it('still authenticates when Redis write fails', async () => {
    redisService.getAuthTokenGuestId.mockResolvedValue(null);
    redisService.setAuthTokenGuestId.mockRejectedValue(new Error('down'));
    guestRepository.findByAuthTokenHash.mockResolvedValue({
      id: 'g1',
      gameId: GameId.FRULOOP,
    });

    await expect(guard.canActivate(createContext('Bearer secret-token'))).resolves.toBe(true);
  });
});
