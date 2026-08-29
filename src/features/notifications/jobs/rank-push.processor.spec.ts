import type { Job, Queue } from 'bullmq';
import { GameId, NotificationLocale } from '@prisma/client';

import type { RedisService } from '@/infra/redis/redis.service';
import { NOTIFICATION_JOB, RANK_PUSH_BATCH_SIZE } from '@/common/constants';
import { RankPushProcessor } from '@/features/notifications/jobs/rank-push.processor';
import type { DeviceTokenService } from '@/features/notifications/device-token.service';
import type { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import type { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

function job(data: Record<string, unknown>, name = NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH) {
  return { name, data } as Job;
}

describe('RankPushProcessor', () => {
  const rankPushQueue = { add: jest.fn() };
  const deviceTokenService = { findActiveTokenBatch: jest.fn() };
  const rankResolver = { resolveRanks: jest.fn() };
  const notificationDelivery = { sendRankPush: jest.fn() };
  const redisService = { tryMarkRankPushSent: jest.fn(), clearRankPushSent: jest.fn() };
  let processor: RankPushProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new RankPushProcessor(
      rankPushQueue as unknown as Queue,
      deviceTokenService as unknown as DeviceTokenService,
      rankResolver as unknown as LeaderboardRankResolverService,
      notificationDelivery as unknown as NotificationDeliveryService,
      redisService as unknown as RedisService,
    );
  });

  it('ignores unrelated job names', async () => {
    await processor.process(job({ gameId: GameId.FRULOOP }, 'other'));
    expect(deviceTokenService.findActiveTokenBatch).not.toHaveBeenCalled();
  });

  it('completes the broadcast when a batch is empty', async () => {
    deviceTokenService.findActiveTokenBatch.mockResolvedValue([]);

    await processor.process(job({ gameId: GameId.FRULOOP, weekKey: '2026-W34' }));

    expect(rankResolver.resolveRanks).not.toHaveBeenCalled();
    expect(rankPushQueue.add).not.toHaveBeenCalled();
  });

  it('skips guests already marked sent and enqueues the next cursor', async () => {
    deviceTokenService.findActiveTokenBatch.mockResolvedValue([
      { id: 'g1', gameId: GameId.FRULOOP, notificationLocale: NotificationLocale.EN },
      { id: 'g2', gameId: GameId.FRULOOP, notificationLocale: NotificationLocale.VI },
    ]);
    rankResolver.resolveRanks.mockResolvedValue(
      new Map([
        ['g1', { rank: 1, bestScore: 100 }],
        ['g2', { rank: 2, bestScore: 90 }],
      ]),
    );
    redisService.tryMarkRankPushSent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    notificationDelivery.sendRankPush.mockResolvedValue(true);

    await processor.process(job({ gameId: GameId.FRULOOP, weekKey: '2026-W34', cursor: 'c0' }));

    expect(deviceTokenService.findActiveTokenBatch).toHaveBeenCalledWith(
      GameId.FRULOOP,
      'c0',
      RANK_PUSH_BATCH_SIZE,
    );
    expect(notificationDelivery.sendRankPush).toHaveBeenCalledTimes(1);
    expect(notificationDelivery.sendRankPush).toHaveBeenCalledWith(GameId.FRULOOP, 'g2', 2, 'vi');
    expect(rankPushQueue.add).toHaveBeenCalledWith(
      NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH,
      { gameId: GameId.FRULOOP, weekKey: '2026-W34', cursor: 'g2' },
      expect.objectContaining({ jobId: 'rank-push-batch-FRULOOP-2026-W34-g2' }),
    );
  });

  it('clears the send marker when the guest has no rank', async () => {
    deviceTokenService.findActiveTokenBatch.mockResolvedValue([
      { id: 'g1', gameId: GameId.FRULOOP, notificationLocale: NotificationLocale.EN },
    ]);
    rankResolver.resolveRanks.mockResolvedValue(new Map());
    redisService.tryMarkRankPushSent.mockResolvedValue(true);

    await processor.process(job({ gameId: GameId.FRULOOP, weekKey: '2026-W01' }));

    expect(notificationDelivery.sendRankPush).not.toHaveBeenCalled();
    expect(redisService.clearRankPushSent).toHaveBeenCalledWith(GameId.FRULOOP, '2026-W01', 'g1');
  });

  it('clears the send marker when FCM delivery fails', async () => {
    deviceTokenService.findActiveTokenBatch.mockResolvedValue([
      { id: 'g1', gameId: GameId.MEMORA, notificationLocale: NotificationLocale.EN },
    ]);
    rankResolver.resolveRanks.mockResolvedValue(new Map([['g1', { rank: 9, bestScore: 1 }]]));
    redisService.tryMarkRankPushSent.mockResolvedValue(true);
    notificationDelivery.sendRankPush.mockResolvedValue(false);

    await processor.process(job({ gameId: GameId.MEMORA, weekKey: '2026-W02' }));

    expect(redisService.clearRankPushSent).toHaveBeenCalledWith(GameId.MEMORA, '2026-W02', 'g1');
  });
});
