import { GameId } from '@prisma/client';
import type { Queue } from 'bullmq';

import { NOTIFICATION_JOB } from '@/common/constants';
import { RankPushEnqueueService } from '@/features/notifications/jobs/rank-push.enqueue';
import { getRankPushWeekKey } from '@/features/notifications/jobs/rank-push-week.util';

describe('RankPushEnqueueService', () => {
  it('enqueues the first batch with a week-scoped job id', async () => {
    const rankPushQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new RankPushEnqueueService(rankPushQueue as unknown as Queue);
    const weekKey = getRankPushWeekKey();

    await service.enqueueRankPushBroadcast(GameId.FRULOOP);

    expect(rankPushQueue.add).toHaveBeenCalledWith(
      NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH,
      { gameId: GameId.FRULOOP, weekKey },
      expect.objectContaining({
        attempts: 3,
        jobId: `rank-push-batch-${GameId.FRULOOP}-${weekKey}-start`,
      }),
    );
  });
});
