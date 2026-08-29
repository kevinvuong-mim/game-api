import { GameId } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

import { TOP_100_THRESHOLD } from '@/common/constants';
import { ResultsService } from '@/features/results/results.service';
import type { ResultsRepository } from '@/features/results/results.repository';
import type { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import type { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

const guest = { guestId: 'submitter', gameId: GameId.FRULOOP };

function batchResult(overrides: Record<string, unknown> = {}) {
  return {
    newBest: 500,
    currentRank: 50,
    previousBest: 10,
    insertedCount: 1,
    displacedGuestRank: 101,
    guestAtRank100BeforeGuestId: 'displaced',
    ...overrides,
  };
}

describe('ResultsService', () => {
  const resultsRepository = { submitValidatedBatch: jest.fn() };
  const rankResolver = { resolveRank: jest.fn() };
  const notificationDelivery = { sendTop100Exited: jest.fn() };
  let service: ResultsService;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationDelivery.sendTop100Exited.mockResolvedValue(true);
    service = new ResultsService(
      resultsRepository as unknown as ResultsRepository,
      rankResolver as unknown as LeaderboardRankResolverService,
      notificationDelivery as unknown as NotificationDeliveryService,
    );
  });

  it('rejects submits for a different game than the authenticated guest', async () => {
    await expect(
      service.submitResults(guest, { gameId: GameId.MEMORA, items: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns rank from the submit transaction when a new best was inserted', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(batchResult());

    await expect(
      service.submitResults(guest, { gameId: GameId.FRULOOP, items: [{ score: 500 }] as never }),
    ).resolves.toEqual({
      insertedCount: 1,
      rank: 50,
      bestScore: 500,
    });
    expect(rankResolver.resolveRank).not.toHaveBeenCalled();
  });

  it('falls back to the rank resolver when nothing was inserted', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(
      batchResult({ insertedCount: 0, newBest: null, currentRank: null }),
    );
    rankResolver.resolveRank.mockResolvedValue({ rank: 12, bestScore: 90 });

    await expect(
      service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] }),
    ).resolves.toEqual({
      insertedCount: 0,
      rank: 12,
      bestScore: 90,
    });
  });

  it('omits rank fields when the guest is not on the leaderboard', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(
      batchResult({ insertedCount: 0, newBest: null, currentRank: null }),
    );
    rankResolver.resolveRank.mockResolvedValue(null);

    await expect(
      service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] }),
    ).resolves.toEqual({ insertedCount: 0 });
  });

  it('notifies the displaced #100 guest when their new rank is outside Top 100', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(batchResult());

    await service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] });
    await Promise.resolve();

    expect(notificationDelivery.sendTop100Exited).toHaveBeenCalledWith(
      GameId.FRULOOP,
      'displaced',
      101,
    );
  });

  it('notifies even when the submitter already had a high previous best score', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(
      batchResult({ previousBest: 400, newBest: 500, currentRank: 50 }),
    );

    await service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] });
    await Promise.resolve();

    expect(notificationDelivery.sendTop100Exited).toHaveBeenCalledWith(
      GameId.FRULOOP,
      'displaced',
      101,
    );
  });

  it('does not notify when the displaced guest is the submitter or still in Top 100', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(
      batchResult({ guestAtRank100BeforeGuestId: 'submitter' }),
    );
    await service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] });
    expect(notificationDelivery.sendTop100Exited).not.toHaveBeenCalled();

    resultsRepository.submitValidatedBatch.mockResolvedValue(
      batchResult({ displacedGuestRank: TOP_100_THRESHOLD }),
    );
    await service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] });
    expect(notificationDelivery.sendTop100Exited).not.toHaveBeenCalled();
  });

  it('swallows FCM failures from the fire-and-forget Top 100 exit', async () => {
    resultsRepository.submitValidatedBatch.mockResolvedValue(batchResult());
    notificationDelivery.sendTop100Exited.mockRejectedValue(new Error('fcm down'));

    await expect(
      service.submitResults(guest, { gameId: GameId.FRULOOP, items: [] }),
    ).resolves.toEqual(expect.objectContaining({ insertedCount: 1 }));

    await new Promise((resolve) => setImmediate(resolve));
  });
});
