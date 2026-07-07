import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RedisService } from '@/modules/redis/redis.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';
import { PlayerEnteredTop100Event, PlayerExitedTop100Event } from '@/modules/events';

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onScoreUpdated(gameId: GameId, guestId: string, newBestScore: number): Promise<void> {
    const previousRank = await this.redisService.getLeaderboardRank(gameId, guestId);
    const guestAtRank100Before = await this.redisService.getLeaderboardEntryAtRank(
      gameId,
      TOP_100_THRESHOLD,
    );

    await this.redisService.updateLeaderboardScore(gameId, guestId, newBestScore);

    const currentRank = await this.redisService.getLeaderboardRank(gameId, guestId);
    if (!currentRank) {
      return;
    }

    await this.handleSubmittingGuest(gameId, guestId, previousRank?.rank ?? null, currentRank);
    await this.handleDisplacedGuest(gameId, guestId, guestAtRank100Before?.guestId ?? null);
  }

  private async handleSubmittingGuest(
    gameId: GameId,
    guestId: string,
    previousRank: number | null,
    currentRank: { rank: number; bestScore: number },
  ): Promise<void> {
    const wasInTop100 = previousRank !== null && previousRank <= TOP_100_THRESHOLD;
    const isInTop100 = currentRank.rank <= TOP_100_THRESHOLD;

    if (!wasInTop100 && isInTop100) {
      await this.markTop100State(gameId, guestId, true, currentRank.rank);
      this.eventEmitter.emit(
        PlayerEnteredTop100Event.name,
        new PlayerEnteredTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
      return;
    }

    if (wasInTop100 && !isInTop100) {
      await this.markTop100State(gameId, guestId, false, currentRank.rank);
      this.eventEmitter.emit(
        PlayerExitedTop100Event.name,
        new PlayerExitedTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
      return;
    }

    await this.markTop100State(gameId, guestId, isInTop100, currentRank.rank);
  }

  private async handleDisplacedGuest(
    gameId: GameId,
    submittingGuestId: string,
    guestAtRank100BeforeId: string | null,
  ): Promise<void> {
    if (!guestAtRank100BeforeId || guestAtRank100BeforeId === submittingGuestId) {
      return;
    }

    const displacedRank = await this.redisService.getLeaderboardRank(
      gameId,
      guestAtRank100BeforeId,
    );
    if (!displacedRank || displacedRank.rank <= TOP_100_THRESHOLD) {
      return;
    }

    const state = await this.prisma.guestNotificationState.findUnique({
      where: {
        gameId_guestId: {
          gameId,
          guestId: guestAtRank100BeforeId,
        },
      },
    });

    if (!state?.inTop100) {
      return;
    }

    await this.markTop100State(gameId, guestAtRank100BeforeId, false, displacedRank.rank);

    this.eventEmitter.emit(
      PlayerExitedTop100Event.name,
      new PlayerExitedTop100Event(
        gameId,
        guestAtRank100BeforeId,
        displacedRank.rank,
        displacedRank.bestScore,
      ),
    );
  }

  private async markTop100State(
    gameId: GameId,
    guestId: string,
    inTop100: boolean,
    lastRank: number,
  ): Promise<void> {
    await this.prisma.guestNotificationState.upsert({
      where: {
        gameId_guestId: {
          gameId,
          guestId,
        },
      },
      create: {
        gameId,
        guestId,
        inTop100,
        lastRank,
      },
      update: {
        inTop100,
        lastRank,
      },
    });
  }
}
