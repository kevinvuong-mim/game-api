import { Job, Queue } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';

import {
  type GameId,
  NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  RANK_PUSH_BATCH_SIZE,
  NOTIFICATION_CRON,
} from '@/common/constants';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';

interface RankPushBatchPayload {
  gameId: GameId;
  cursor?: string;
  weekKey: string;
}

const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

/** Calendar week key in the notification timezone — used for BullMQ jobId dedupe. */
export function getRankPushWeekKey(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: NOTIFICATION_CRON.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

@Injectable()
export class RankPushCronService {
  private readonly logger = new Logger(RankPushCronService.name);

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
        ...JOB_DEFAULTS,
        jobId: `rank-push-start-${gameId}-${weekKey}`,
      },
    );
    this.logger.log(`Rank push broadcast enqueued for ${gameId} (${weekKey})`);
  }
}

@Processor(NOTIFICATION_QUEUE.RANK_PUSH)
export class RankPushProcessor extends WorkerHost {
  private readonly logger = new Logger(RankPushProcessor.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.RANK_PUSH)
    private readonly rankPushQueue: Queue,
    private readonly deviceTokenRepository: DeviceTokenRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
    private readonly notificationDispatcher: NotificationDispatcherService,
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
          ...JOB_DEFAULTS,
          jobId: `rank-push-batch-${job.data.gameId}-${weekKey}-start`,
        },
      );
      return;
    }

    if (job.name !== NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH) {
      return;
    }

    const { gameId, cursor } = job.data;
    const devices = await this.deviceTokenRepository.findActiveTokenBatch(
      gameId,
      cursor,
      RANK_PUSH_BATCH_SIZE,
    );

    if (devices.length === 0) {
      this.logger.log(`Rank push broadcast completed for ${gameId}`);
      return;
    }

    for (const device of devices) {
      const rankInfo = await this.rankResolver.resolveRank(device.gameId as GameId, device.id);
      if (!rankInfo) {
        continue;
      }

      await this.notificationDispatcher.sendRankPush(
        device.gameId as GameId,
        device.id,
        rankInfo.rank,
        device.notificationLocale === 'VI' ? 'vi' : 'en',
      );
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
        ...JOB_DEFAULTS,
        jobId: `rank-push-batch-${gameId}-${weekKey}-${lastDevice.id}`,
      },
    );

    this.logger.log(`Rank push batch processed for ${gameId}: ${devices.length} devices`);
  }
}
