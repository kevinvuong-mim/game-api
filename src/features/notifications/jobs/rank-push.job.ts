import { Job, Queue } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';

import {
  type GameId,
  NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  RANK_PUSH_BATCH_SIZE,
} from '@/common/constants';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';

interface RankPushBatchPayload {
  gameId: GameId;
  cursor?: string;
}

@Injectable()
export class RankPushCronService {
  private readonly logger = new Logger(RankPushCronService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.RANK_PUSH)
    private readonly rankPushQueue: Queue,
  ) {}

  async enqueueRankPushBroadcast(gameId: GameId): Promise<void> {
    await this.rankPushQueue.add(NOTIFICATION_JOB.START_RANK_PUSH_BROADCAST, { gameId });
    this.logger.log(`Rank push broadcast enqueued for ${gameId}`);
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
    if (job.name === NOTIFICATION_JOB.START_RANK_PUSH_BROADCAST) {
      await this.rankPushQueue.add(NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH, {
        gameId: job.data.gameId,
      });
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
    await this.rankPushQueue.add(NOTIFICATION_JOB.SEND_RANK_PUSH_BATCH, {
      gameId,
      cursor: lastDevice.id,
    });

    this.logger.log(`Rank push batch processed for ${gameId}: ${devices.length} devices`);
  }
}
