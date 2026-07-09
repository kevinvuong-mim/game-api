import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';

import {
  type GameId,
  GAME_CONFIG,
  NOTIFICATION_CRON,
  getGamesWithRankPushCron,
} from '@/common/constants';
import { RankPushCronService } from '@/features/notifications/jobs/rank-push.job';

@Injectable()
export class RankPushScheduler implements OnModuleInit {
  private readonly logger = new Logger(RankPushScheduler.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly rankPushCronService: RankPushCronService,
  ) {}

  onModuleInit(): void {
    for (const gameId of getGamesWithRankPushCron()) {
      const cronExpression = GAME_CONFIG[gameId].rankPushCron;
      if (!cronExpression) {
        continue;
      }

      const job = new CronJob(
        cronExpression,
        () => {
          void this.handleRankPushBroadcast(gameId);
        },
        null,
        true,
        NOTIFICATION_CRON.TIMEZONE,
      );

      this.schedulerRegistry.addCronJob(`rank-push-${gameId}`, job);
      this.logger.log(`Rank push cron registered for ${gameId}: ${cronExpression}`);
    }
  }

  private async handleRankPushBroadcast(gameId: GameId): Promise<void> {
    this.logger.log(`Starting rank push notification broadcast for ${gameId}`);
    await this.rankPushCronService.enqueueRankPushBroadcast(gameId);
  }
}
