import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RedisService } from '@/infra/redis/redis.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';
import { ResultsRepository } from '@/features/results/results.repository';
import { PlayerEnteredTop100Event, PlayerExitedTop100Event } from '@/domain/events';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly resultsRepository: ResultsRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
  ) {}

  async onScoreUpdated(gameId: GameId, guestId: string, newBestScore: number): Promise<void> {
    const previousRank = await this.rankResolver.resolveRank(gameId, guestId);
    const guestAtRank100Before =
      (await this.redisService.getLeaderboardEntryAtRank(gameId, TOP_100_THRESHOLD)) ??
      (await this.resultsRepository.getGuestAtRank(gameId, TOP_100_THRESHOLD));

    await this.redisService.updateLeaderboardScore(gameId, guestId, newBestScore);

    const currentRank = await this.rankResolver.resolveRank(gameId, guestId);
    if (!currentRank) {
      return;
    }

    await this.handleSubmittingGuest(gameId, guestId, previousRank?.rank ?? null, currentRank);
    await this.handleDisplacedGuest(gameId, guestId, guestAtRank100Before?.guestId ?? null);
  }

  async confirmTop100Entered(gameId: GameId, guestId: string, _rank: number): Promise<void> {
    await this.markTop100State(gameId, guestId, true);
  }

  async maybeNotifyTop100OnDeviceRegister(gameId: GameId, guestId: string): Promise<void> {
    const guest = await this.prisma.guestPlayer.findUnique({
      where: { gameId_id: { gameId, id: guestId } },
      select: { inTop100: true },
    });

    if (guest?.inTop100) {
      return;
    }

    const rank = await this.rankResolver.resolveRank(gameId, guestId);
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
      await this.markTop100State(gameId, guestId, true);
      this.eventEmitter.emit(
        PlayerEnteredTop100Event.name,
        new PlayerEnteredTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
      return;
    }

    if (wasInTop100 && !isInTop100) {
      await this.markTop100State(gameId, guestId, false);
      this.eventEmitter.emit(
        PlayerExitedTop100Event.name,
        new PlayerExitedTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
      return;
    }

    await this.markTop100State(gameId, guestId, isInTop100);
  }

  private async handleDisplacedGuest(
    gameId: GameId,
    submittingGuestId: string,
    guestAtRank100BeforeId: string | null,
  ): Promise<void> {
    if (!guestAtRank100BeforeId || guestAtRank100BeforeId === submittingGuestId) {
      return;
    }

    const displacedRank = await this.rankResolver.resolveRank(gameId, guestAtRank100BeforeId);
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

    await this.markTop100State(gameId, guestAtRank100BeforeId, false);

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

  private async markTop100State(gameId: GameId, guestId: string, inTop100: boolean): Promise<void> {
    await this.prisma.guestPlayer.update({
      where: {
        gameId_id: {
          gameId,
          id: guestId,
        },
      },
      data: { inTop100 },
    });
  }
}
