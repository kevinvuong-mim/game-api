import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';

import { type GameId, NOTIFICATION_JOB, NOTIFICATION_QUEUE } from '@/common/constants';
import { getRankPushWeekKey } from '@/features/notifications/jobs/rank-push-week.util';

export const RANK_PUSH_JOB_DEFAULTS = {
  attempts: 3,
  removeOnFail: 100,
  removeOnComplete: true,
  backoff: { type: 'exponential' as const, delay: 5_000 },
};

@Injectable()
export class RankPushEnqueueService {
  private readonly logger = new Logger(RankPushEnqueueService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.RANK_PUSH)
    private readonly rankPushQueue: Queue,
  ) {}

  async enqueueRankPushBroadcast(gameId: GameId): Promise<void> {
    const weekKey = getRankPushWeekKey();
    await this.rankPushQueue.add(
      NOTIFICATION_JOB.START_RANK_PUSH_BROADCAST,
      { gameId, weekKey },
      {
        ...RANK_PUSH_JOB_DEFAULTS,
        jobId: `rank-push-start-${gameId}-${weekKey}`,
      },
    );
    this.logger.log(`Rank push broadcast enqueued for ${gameId} (${weekKey})`);
  }
}
