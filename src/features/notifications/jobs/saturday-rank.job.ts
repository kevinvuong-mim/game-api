import { Job, Queue } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';

import {
  type GameId,
  NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  SATURDAY_RANK_BATCH_SIZE,
} from '@/common/constants';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';

interface SaturdayRankBatchPayload {
  cursor?: string;
}

@Injectable()
export class SaturdayRankCronService {
  private readonly logger = new Logger(SaturdayRankCronService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.SATURDAY_RANK)
    private readonly saturdayRankQueue: Queue,
  ) {}

  async enqueueSaturdayBroadcast(): Promise<void> {
    await this.saturdayRankQueue.add(NOTIFICATION_JOB.START_SATURDAY_BROADCAST, {});
    this.logger.log('Saturday rank broadcast enqueued');
  }
}

@Processor(NOTIFICATION_QUEUE.SATURDAY_RANK)
export class SaturdayRankProcessor extends WorkerHost {
  private readonly logger = new Logger(SaturdayRankProcessor.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.SATURDAY_RANK)
    private readonly saturdayRankQueue: Queue,
    private readonly deviceTokenRepository: DeviceTokenRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {
    super();
  }

  async process(job: Job<SaturdayRankBatchPayload | Record<string, never>>): Promise<void> {
    if (job.name === NOTIFICATION_JOB.START_SATURDAY_BROADCAST) {
      await this.saturdayRankQueue.add(NOTIFICATION_JOB.SEND_SATURDAY_RANK_BATCH, {});
      return;
    }

    if (job.name !== NOTIFICATION_JOB.SEND_SATURDAY_RANK_BATCH) {
      return;
    }

    const cursor = job.data.cursor;
    const devices = await this.deviceTokenRepository.findActiveTokenBatch(
      cursor,
      SATURDAY_RANK_BATCH_SIZE,
    );

    if (devices.length === 0) {
      this.logger.log('Saturday rank broadcast completed');
      return;
    }

    for (const device of devices) {
      const rankInfo = await this.rankResolver.resolveRank(device.gameId as GameId, device.id);
      if (!rankInfo) {
        continue;
      }

      await this.notificationDispatcher.sendSaturdayRank(
        device.gameId as GameId,
        device.id,
        rankInfo.rank,
        device.notificationLocale === 'VI' ? 'vi' : 'en',
      );
    }

    const lastDevice = devices[devices.length - 1];
    await this.saturdayRankQueue.add(NOTIFICATION_JOB.SEND_SATURDAY_RANK_BATCH, {
      cursor: lastDevice.id,
    });

    this.logger.log(`Saturday rank batch processed: ${devices.length} devices`);
  }
}
