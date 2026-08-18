import { GameId } from '@prisma/client';

import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import type { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';

describe('LeaderboardRankResolverService', () => {
  const leaderboardRepository = {
    getGuestBestScore: jest.fn(),
    countBetterRanks: jest.fn(),
    resolveRanksForGuests: jest.fn(),
  };
  let service: LeaderboardRankResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaderboardRankResolverService(
      leaderboardRepository as unknown as LeaderboardRepository,
    );
  });

  it('returns null when the guest has no leaderboard row', async () => {
    leaderboardRepository.getGuestBestScore.mockResolvedValue(null);

    await expect(service.resolveRank(GameId.FRULOOP, 'g1')).resolves.toBeNull();
    expect(leaderboardRepository.countBetterRanks).not.toHaveBeenCalled();
  });

  it('computes rank as betterCount + 1', async () => {
    leaderboardRepository.getGuestBestScore.mockResolvedValue({ bestScore: 50 });
    leaderboardRepository.countBetterRanks.mockResolvedValue(4);

    await expect(service.resolveRank(GameId.FRULOOP, 'g1')).resolves.toEqual({
      rank: 5,
      bestScore: 50,
    });
  });

  it('maps batch ranks by guest id', async () => {
    leaderboardRepository.resolveRanksForGuests.mockResolvedValue([
      { guestId: 'g1', rank: 1, bestScore: 100 },
      { guestId: 'g2', rank: 2, bestScore: 90 },
    ]);

    await expect(service.resolveRanks(GameId.MEMORA, ['g1', 'g2'])).resolves.toEqual(
      new Map([
        ['g1', { rank: 1, bestScore: 100 }],
        ['g2', { rank: 2, bestScore: 90 }],
      ]),
    );
  });
});
