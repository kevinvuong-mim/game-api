import { GameId } from '@prisma/client';
import { SchedulerRegistry } from '@nestjs/schedule';

import { GAME_CONFIG, NOTIFICATION_CRON } from '@/common/constants';
import { RankPushScheduler } from '@/features/notifications/jobs/rank-push.scheduler';
import type { RankPushEnqueueService } from '@/features/notifications/jobs/rank-push.enqueue';

const cronJobs: Array<{ expression: string; onTick: () => void; timezone: string }> = [];

jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation((expression, onTick, _onComplete, _start, timezone) => {
    cronJobs.push({ expression, onTick, timezone });
    return { start: jest.fn() };
  }),
}));

describe('RankPushScheduler', () => {
  const schedulerRegistry = { addCronJob: jest.fn() };
  const rankPushEnqueue = { enqueueRankPushBroadcast: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    cronJobs.length = 0;
    rankPushEnqueue.enqueueRankPushBroadcast.mockResolvedValue(undefined);
  });

  it('registers a cron job per game that has rankPushCron', () => {
    const scheduler = new RankPushScheduler(
      schedulerRegistry as unknown as SchedulerRegistry,
      rankPushEnqueue as unknown as RankPushEnqueueService,
    );
    scheduler.onModuleInit();

    expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(2);
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      `rank-push-${GameId.FRULOOP}`,
      expect.anything(),
    );
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      `rank-push-${GameId.MEMORA}`,
      expect.anything(),
    );
    expect(cronJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expression: GAME_CONFIG[GameId.FRULOOP].rankPushCron,
          timezone: NOTIFICATION_CRON.TIMEZONE,
        }),
      ]),
    );
  });

  it('enqueues a broadcast when the cron fires', async () => {
    const scheduler = new RankPushScheduler(
      schedulerRegistry as unknown as SchedulerRegistry,
      rankPushEnqueue as unknown as RankPushEnqueueService,
    );
    scheduler.onModuleInit();

    cronJobs[0].onTick();
    await Promise.resolve();

    expect(rankPushEnqueue.enqueueRankPushBroadcast).toHaveBeenCalledWith(
      expect.stringMatching(/^(FRULOOP|MEMORA)$/),
    );
  });
});
