import { GameId } from '@prisma/client';

import type { GuestRepository } from '@/features/guest/guest.repository';
import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import type { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';
import type { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

describe('LeaderboardService', () => {
  const guestRepository = { findNamesByIds: jest.fn() };
  const leaderboardRepository = { count: jest.fn(), findPage: jest.fn() };
  const rankResolver = { resolveRank: jest.fn() };
  let service: LeaderboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaderboardService(
      guestRepository as unknown as GuestRepository,
      leaderboardRepository as unknown as LeaderboardRepository,
      rankResolver as unknown as LeaderboardRankResolverService,
    );
  });

  it('returns a paginated page with ranks and resolved names', async () => {
    leaderboardRepository.count.mockResolvedValue(40);
    leaderboardRepository.findPage.mockResolvedValue([
      { guestId: 'g1', bestScore: 90 },
      { guestId: 'g2', bestScore: 80 },
    ]);
    guestRepository.findNamesByIds.mockResolvedValue(new Map([['g1', 'Ada']]));

    await expect(
      service.getLeaderboard({ gameId: GameId.FRULOOP, page: 2, limit: 20 }),
    ).resolves.toEqual({
      page: 2,
      limit: 20,
      total: 40,
      gameId: GameId.FRULOOP,
      items: [
        { rank: 21, guestId: 'g1', bestScore: 90, name: 'Ada' },
        { rank: 22, guestId: 'g2', bestScore: 80, name: null },
      ],
      self: null,
    });
    expect(leaderboardRepository.findPage).toHaveBeenCalledWith(GameId.FRULOOP, 20, 20);
    expect(rankResolver.resolveRank).not.toHaveBeenCalled();
  });

  it('includes self rank when guestId is provided', async () => {
    leaderboardRepository.count.mockResolvedValue(1);
    leaderboardRepository.findPage.mockResolvedValue([{ guestId: 'g1', bestScore: 10 }]);
    guestRepository.findNamesByIds.mockResolvedValue(new Map([['g1', null]]));
    rankResolver.resolveRank.mockResolvedValue({ rank: 4, bestScore: 10 });

    const result = await service.getLeaderboard({
      gameId: GameId.MEMORA,
      page: 1,
      limit: 20,
      guestId: 'g1',
    });

    expect(result.self).toEqual({ rank: 4, bestScore: 10 });
  });

  it('returns null self when the guest is not on the board', async () => {
    leaderboardRepository.count.mockResolvedValue(0);
    leaderboardRepository.findPage.mockResolvedValue([]);
    guestRepository.findNamesByIds.mockResolvedValue(new Map());
    rankResolver.resolveRank.mockResolvedValue(null);

    const result = await service.getLeaderboard({
      gameId: GameId.FRULOOP,
      page: 1,
      limit: 20,
      guestId: 'missing',
    });

    expect(result.self).toBeNull();
  });
});
