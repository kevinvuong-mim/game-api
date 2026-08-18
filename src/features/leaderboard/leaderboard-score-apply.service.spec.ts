import { GameId } from '@prisma/client';

import { TOP_100_THRESHOLD } from '@/common/constants';
import { LeaderboardScoreApplyService } from '@/features/leaderboard/leaderboard-score-apply.service';
import type { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';

describe('LeaderboardScoreApplyService', () => {
  const leaderboardRepository = {
    getGuestBestScoreTx: jest.fn(),
    findGuestAtRankTx: jest.fn(),
    upsertBestScoreTx: jest.fn(),
    countBetterRanksTx: jest.fn(),
  };
  const tx = { $executeRaw: jest.fn() };
  let service: LeaderboardScoreApplyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaderboardScoreApplyService(
      leaderboardRepository as unknown as LeaderboardRepository,
    );
  });

  it('collects before/after rank fields when a different guest occupied #100', async () => {
    leaderboardRepository.getGuestBestScoreTx
      .mockResolvedValueOnce({ bestScore: 20 })
      .mockResolvedValueOnce({ bestScore: 80 })
      .mockResolvedValueOnce({ bestScore: 40 });
    leaderboardRepository.findGuestAtRankTx.mockResolvedValue([{ guestId: 'g100' }]);
    leaderboardRepository.countBetterRanksTx.mockResolvedValueOnce(4).mockResolvedValueOnce(100);

    const result = await service.applyBestScoreAndCollectDelta(
      tx as never,
      GameId.FRULOOP,
      'submitter',
      80,
    );

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(leaderboardRepository.findGuestAtRankTx).toHaveBeenCalledWith(
      tx,
      GameId.FRULOOP,
      TOP_100_THRESHOLD,
    );
    expect(leaderboardRepository.upsertBestScoreTx).toHaveBeenCalledWith(
      tx,
      GameId.FRULOOP,
      'submitter',
      80,
    );
    expect(result).toEqual({
      newBest: 80,
      currentRank: 5,
      previousBest: 20,
      displacedGuestRank: 101,
      displacedGuestBestScore: 40,
      guestAtRank100BeforeGuestId: 'g100',
    });
  });

  it('skips displaced-guest lookup when the submitter already occupied #100', async () => {
    leaderboardRepository.getGuestBestScoreTx
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ bestScore: 10 });
    leaderboardRepository.findGuestAtRankTx.mockResolvedValue([{ guestId: 'submitter' }]);
    leaderboardRepository.countBetterRanksTx.mockResolvedValue(0);

    const result = await service.applyBestScoreAndCollectDelta(
      tx as never,
      GameId.MEMORA,
      'submitter',
      10,
    );

    expect(leaderboardRepository.getGuestBestScoreTx).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      newBest: 10,
      currentRank: 1,
      previousBest: null,
      displacedGuestRank: null,
      displacedGuestBestScore: null,
      guestAtRank100BeforeGuestId: 'submitter',
    });
  });

  it('falls back to the candidate score when the post-upsert row is missing', async () => {
    leaderboardRepository.getGuestBestScoreTx.mockResolvedValue(null);
    leaderboardRepository.findGuestAtRankTx.mockResolvedValue([]);
    leaderboardRepository.countBetterRanksTx.mockResolvedValue(9);

    const result = await service.applyBestScoreAndCollectDelta(
      tx as never,
      GameId.FRULOOP,
      'g1',
      15,
    );

    expect(result.newBest).toBe(15);
    expect(result.currentRank).toBe(10);
    expect(result.guestAtRank100BeforeGuestId).toBeNull();
  });
});
