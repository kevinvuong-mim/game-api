import { GameId } from '@prisma/client';

import { SUBMIT_RESULT_TX } from '@/common/constants';
import type { PrismaService } from '@/infra/prisma/prisma.service';
import { ResultsRepository } from '@/features/results/results.repository';
import type { PartitionService } from '@/infra/maintenance/partition.service';
import type { LeaderboardScoreApplyService } from '@/features/leaderboard/leaderboard-score-apply.service';

describe('ResultsRepository', () => {
  const tx = {
    $executeRaw: jest.fn(),
    gameResult: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const partitionService = { ensurePartitionForInsertDate: jest.fn() };
  const leaderboardScoreApply = { applyBestScoreAndCollectDelta: jest.fn() };
  let repository: ResultsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    repository = new ResultsRepository(
      prisma as unknown as PrismaService,
      partitionService as unknown as PartitionService,
      leaderboardScoreApply as unknown as LeaderboardScoreApplyService,
    );
  });

  it('ensures partitions then opens a transaction with an extended timeout', async () => {
    tx.gameResult.findFirst.mockResolvedValue({ id: 'existing' });

    await repository.submitValidatedBatch(GameId.FRULOOP, 'g1', [
      { clientResultId: 'dup', score: 1 },
    ]);

    expect(partitionService.ensurePartitionForInsertDate).toHaveBeenCalledWith(expect.any(Date));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: SUBMIT_RESULT_TX.maxWait,
      timeout: SUBMIT_RESULT_TX.timeout,
    });
  });

  it('returns an empty result when the batch is empty', async () => {
    await expect(repository.submitValidatedBatch(GameId.FRULOOP, 'g1', [])).resolves.toEqual({
      newBest: null,
      insertedCount: 0,
      currentRank: null,
      previousBest: null,
      displacedGuestRank: null,
      guestAtRank100BeforeGuestId: null,
    });
    expect(leaderboardScoreApply.applyBestScoreAndCollectDelta).not.toHaveBeenCalled();
  });

  it('skips duplicates and applies the max inserted score', async () => {
    tx.gameResult.findFirst
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    leaderboardScoreApply.applyBestScoreAndCollectDelta.mockResolvedValue({
      newBest: 40,
      currentRank: 3,
      previousBest: 10,
      displacedGuestRank: null,
      guestAtRank100BeforeGuestId: null,
    });

    const result = await repository.submitValidatedBatch(GameId.FRULOOP, 'g1', [
      { clientResultId: 'dup', score: 99 },
      { clientResultId: 'a', score: 20 },
      { clientResultId: 'b', score: 40, playedAt: '2026-01-01T00:00:00.000Z', metadata: { w: 1 } },
    ]);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(tx.gameResult.create).toHaveBeenCalledTimes(2);
    expect(leaderboardScoreApply.applyBestScoreAndCollectDelta).toHaveBeenCalledWith(
      tx,
      GameId.FRULOOP,
      'g1',
      40,
    );
    expect(result).toEqual(
      expect.objectContaining({
        insertedCount: 2,
        newBest: 40,
        currentRank: 3,
      }),
    );
  });

  it('returns an empty result when every item is a duplicate', async () => {
    tx.gameResult.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      repository.submitValidatedBatch(GameId.FRULOOP, 'g1', [{ clientResultId: 'dup', score: 1 }]),
    ).resolves.toEqual(
      expect.objectContaining({
        insertedCount: 0,
        newBest: null,
        currentRank: null,
      }),
    );
    expect(leaderboardScoreApply.applyBestScoreAndCollectDelta).not.toHaveBeenCalled();
  });
});
