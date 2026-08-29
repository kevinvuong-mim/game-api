import { GameId } from '@prisma/client';

import { TOP_100_THRESHOLD } from '@/common/constants';
import type { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';
import { LeaderboardScoreApplyService } from '@/features/leaderboard/leaderboard-score-apply.service';

describe('LeaderboardScoreApplyService', () => {
  const leaderboardRepository = {
    findGuestAtRankTx: jest.fn(),
    upsertBestScoreTx: jest.fn(),
    countBetterRanksTx: jest.fn(),
    getGuestBestScoreTx: jest.fn(),
  };
  const tx = { $executeRaw: jest.fn() };
  let service: LeaderboardScoreApplyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaderboardScoreApplyService(
      leaderboardRepository as unknown as LeaderboardRepository,
    );
  });

  it('skips the game lock and snapshot when the candidate is not a new best', async () => {
    leaderboardRepository.getGuestBestScoreTx.mockResolvedValue({ bestScore: 80 });
    leaderboardRepository.countBetterRanksTx.mockResolvedValue(4);

    const result = await service.applyBestScoreAndCollectDelta(
      tx as never,
      GameId.FRULOOP,
      'submitter',
      50,
    );

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(leaderboardRepository.findGuestAtRankTx).not.toHaveBeenCalled();
    expect(leaderboardRepository.upsertBestScoreTx).not.toHaveBeenCalled();
    expect(result).toEqual({
      newBest: 80,
      currentRank: 5,
      previousBest: 80,
      displacedGuestRank: null,
      guestAtRank100BeforeGuestId: null,
    });
  });

  it('skips the #100 snapshot when the submitter was already in Top 100', async () => {
    leaderboardRepository.getGuestBestScoreTx
      .mockResolvedValueOnce({ bestScore: 50 })
      .mockResolvedValueOnce({ bestScore: 50 })
      .mockResolvedValueOnce({ bestScore: 80 });
    leaderboardRepository.countBetterRanksTx.mockResolvedValueOnce(4).mockResolvedValueOnce(0);

    const result = await service.applyBestScoreAndCollectDelta(
      tx as never,
      GameId.FRULOOP,
      'submitter',
      80,
    );

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(leaderboardRepository.findGuestAtRankTx).not.toHaveBeenCalled();
    expect(leaderboardRepository.upsertBestScoreTx).toHaveBeenCalledWith(
      tx,
      GameId.FRULOOP,
      'submitter',
      80,
    );
    expect(result).toEqual({
      newBest: 80,
      currentRank: 1,
      previousBest: 50,
      displacedGuestRank: null,
      guestAtRank100BeforeGuestId: null,
    });
  });

  it('collects before/after rank fields when a different guest occupied #100', async () => {
    leaderboardRepository.getGuestBestScoreTx
      .mockResolvedValueOnce({ bestScore: 500 })
      .mockResolvedValueOnce({ bestScore: 500 })
      .mockResolvedValueOnce({ bestScore: 800 })
      .mockResolvedValueOnce({ bestScore: 40 });
    leaderboardRepository.findGuestAtRankTx.mockResolvedValue([{ guestId: 'g100' }]);
    leaderboardRepository.countBetterRanksTx
      .mockResolvedValueOnce(149)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(100);

    const result = await service.applyBestScoreAndCollectDelta(
      tx as never,
      GameId.FRULOOP,
      'submitter',
      800,
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
      800,
    );
    expect(result).toEqual({
      newBest: 800,
      currentRank: 5,
      previousBest: 500,
      displacedGuestRank: 101,
      guestAtRank100BeforeGuestId: 'g100',
    });
  });

  it('skips displaced-guest lookup when the submitter already occupied #100', async () => {
    leaderboardRepository.getGuestBestScoreTx
      .mockResolvedValueOnce(null)
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

    expect(result).toEqual({
      newBest: 10,
      currentRank: 1,
      previousBest: null,
      displacedGuestRank: null,
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
