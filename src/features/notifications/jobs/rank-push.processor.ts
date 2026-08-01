import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';

import {
  type GameId,
  NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  RANK_PUSH_BATCH_SIZE,
} from '@/common/constants';
import { RedisService } from '@/infra/redis/redis.service';
import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { toNotificationLocaleCode } from '@/common/constants/notification.constants';
import { getRankPushWeekKey } from '@/features/notifications/jobs/rank-push-week.util';
import { RANK_PUSH_JOB_DEFAULTS } from '@/features/notifications/jobs/rank-push.enqueue';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

interface RankPushBatchPayload {
  gameId: GameId;
  cursor?: string;
  weekKey: string;
}

@Processor(NOTIFICATION_QUEUE.RANK_PUSH)
export class RankPushProcessor extends WorkerHost {
  private readonly logger = new Logger(RankPushProcessor.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.RANK_PUSH)
    private readonly rankPushQueue: Queue,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly rankResolver: LeaderboardRankResolverService,
    private readonly notificationDelivery: NotificationDeliveryService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<RankPushBatchPayload>): Promise<void> {
    const weekKey = job.data.weekKey ?? getRankPushWeekKey();

    if (job.name === NOTIFICATION_JOB.START_RANK_PUSH_BROADCAST) {
      await this.rankPushQueue.add(
        NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH,
        { gameId: job.data.gameId, weekKey },
        {
          ...RANK_PUSH_JOB_DEFAULTS,
          jobId: `rank-push-batch-${job.data.gameId}-${weekKey}-start`,
        },
      );
      return;
    }

    if (job.name !== NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH) {
      return;
    }

    const { gameId, cursor } = job.data;
    const devices = await this.deviceTokenService.findActiveTokenBatch(
      gameId,
      cursor,
      RANK_PUSH_BATCH_SIZE,
    );

    if (devices.length === 0) {
      this.logger.log(`Rank push broadcast completed for ${gameId}`);
      return;
    }

    const ranksByGuestId = await this.rankResolver.resolveRanks(
      gameId,
      devices.map((device) => device.id),
    );

    for (const device of devices) {
      const claimed = await this.redisService.tryMarkRankPushSent(gameId, weekKey, device.id);
      if (!claimed) {
        continue;
      }

      const rankInfo = ranksByGuestId.get(device.id);
      if (!rankInfo) {
        await this.redisService.clearRankPushSent(gameId, weekKey, device.id);
        continue;
      }

      const sent = await this.notificationDelivery.sendRankPush(
        device.gameId as GameId,
        device.id,
        rankInfo.rank,
        toNotificationLocaleCode(device.notificationLocale),
      );

      if (!sent) {
        await this.redisService.clearRankPushSent(gameId, weekKey, device.id);
      }
    }

    const lastDevice = devices[devices.length - 1];
    await this.rankPushQueue.add(
      NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH,
      {
        gameId,
        weekKey,
        cursor: lastDevice.id,
      },
      {
        ...RANK_PUSH_JOB_DEFAULTS,
        jobId: `rank-push-batch-${gameId}-${weekKey}-${lastDevice.id}`,
      },
    );

    this.logger.log(`Rank push batch processed for ${gameId}: ${devices.length} devices`);
  }
}
