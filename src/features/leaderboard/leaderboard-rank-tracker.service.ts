import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RedisService } from '@/infra/redis/redis.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';
import { ResultsRepository } from '@/features/results/results.repository';
import { PlayerEnteredTop100Event, PlayerExitedTop100Event } from '@/domain/events';

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly resultsRepository: ResultsRepository,
  ) {}

  async onScoreUpdated(gameId: GameId, guestId: string, newBestScore: number): Promise<void> {
    const previousRank = await this.resolveRank(gameId, guestId);
    const guestAtRank100Before =
      (await this.redisService.getLeaderboardEntryAtRank(gameId, TOP_100_THRESHOLD)) ??
      (await this.resultsRepository.getGuestAtRank(gameId, TOP_100_THRESHOLD));

    await this.redisService.updateLeaderboardScore(gameId, guestId, newBestScore);

    const currentRank = await this.resolveRank(gameId, guestId);
    if (!currentRank) {
      return;
    }

    await this.handleSubmittingGuest(gameId, guestId, previousRank?.rank ?? null, currentRank);
    await this.handleDisplacedGuest(gameId, guestId, guestAtRank100Before?.guestId ?? null);
  }

  async confirmTop100Entered(gameId: GameId, guestId: string, rank: number): Promise<void> {
    await this.markTop100State(gameId, guestId, true, rank);
  }

  async maybeNotifyTop100OnDeviceRegister(gameId: GameId, guestId: string): Promise<void> {
    const guest = await this.prisma.guestPlayer.findUnique({
      where: { gameId_id: { gameId, id: guestId } },
      select: { inTop100: true },
    });

    if (guest?.inTop100) {
      return;
    }

    const rank = await this.resolveRank(gameId, guestId);
    if (!rank || rank.rank > TOP_100_THRESHOLD) {
      return;
    }

    this.eventEmitter.emit(
      PlayerEnteredTop100Event.name,
      new PlayerEnteredTop100Event(gameId, guestId, rank.rank, rank.bestScore),
    );
  }

  private async handleSubmittingGuest(
    gameId: GameId,
    guestId: string,
    previousRank: number | null,
    currentRank: { rank: number; bestScore: number },
  ): Promise<void> {
    const guest = await this.prisma.guestPlayer.findUnique({
      where: { gameId_id: { gameId, id: guestId } },
      select: { inTop100: true },
    });

    const wasInTop100 =
      guest?.inTop100 === true || (previousRank !== null && previousRank <= TOP_100_THRESHOLD);
    const isInTop100 = currentRank.rank <= TOP_100_THRESHOLD;

    if (!wasInTop100 && isInTop100) {
      if (guest?.inTop100) {
        await this.updateLastRank(gameId, guestId, currentRank.rank);
        return;
      }

      await this.updateLastRank(gameId, guestId, currentRank.rank);
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

    const displacedRank = await this.resolveRank(gameId, guestAtRank100BeforeId);
    if (!displacedRank || displacedRank.rank <= TOP_100_THRESHOLD) {
      return;
    }

    const guest = await this.prisma.guestPlayer.findUnique({
      where: {
        gameId_id: {
          gameId,
          id: guestAtRank100BeforeId,
        },
      },
    });

    if (!guest?.inTop100) {
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

  private async resolveRank(gameId: GameId, guestId: string) {
    try {
      const cached = await this.redisService.getLeaderboardRank(gameId, guestId);
      if (cached) {
        return cached;
      }
    } catch {
      // Fall back to PostgreSQL when Redis is unavailable.
    }

    const row = await this.resultsRepository.getGuestBestScore(gameId, guestId);
    if (!row) {
      return null;
    }

    const betterCount = await this.resultsRepository.countBetterScores(gameId, row.bestScore);
    return {
      rank: betterCount + 1,
      bestScore: row.bestScore,
    };
  }

  private async updateLastRank(gameId: GameId, guestId: string, lastRank: number): Promise<void> {
    await this.prisma.guestPlayer.update({
      where: {
        gameId_id: {
          gameId,
          id: guestId,
        },
      },
      data: { lastRank },
    });
  }

  private async markTop100State(
    gameId: GameId,
    guestId: string,
    inTop100: boolean,
    lastRank: number,
  ): Promise<void> {
    await this.prisma.guestPlayer.update({
      where: {
        gameId_id: {
          gameId,
          id: guestId,
        },
      },
      data: {
        inTop100,
        lastRank,
      },
    });
  }
}
