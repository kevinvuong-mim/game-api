import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';
import { PlayerEnteredTop100Event, PlayerExitedTop100Event } from '@/domain/events';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

export interface ScoreUpdateContext {
  previousRank: number | null;
  guestAtRank100BeforeGuestId: string | null;
}

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly rankResolver: LeaderboardRankResolverService,
  ) {}

  async onScoreUpdated(
    gameId: GameId,
    guestId: string,
    context: ScoreUpdateContext,
  ): Promise<void> {
    const currentRank = await this.rankResolver.resolveRank(gameId, guestId);
    if (!currentRank) {
      return;
    }

    await this.handleSubmittingGuest(gameId, guestId, context.previousRank, currentRank);
    await this.handleDisplacedGuest(gameId, guestId, context.guestAtRank100BeforeGuestId);
  }

  async confirmTop100Entered(gameId: GameId, guestId: string, _rank: number): Promise<void> {
    await this.markTop100EnterNotified(gameId, guestId, true);
  }

  async maybeNotifyTop100OnDeviceRegister(gameId: GameId, guestId: string): Promise<void> {
    const guest = await this.prisma.guestPlayer.findUnique({
      where: { gameId_id: { gameId, id: guestId } },
      select: { top100EnterNotified: true },
    });

    if (guest?.top100EnterNotified) {
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
      select: { top100EnterNotified: true },
    });

    const isInTop100 = currentRank.rank <= TOP_100_THRESHOLD;
    const rankCrossedIntoTop100 =
      isInTop100 && (previousRank === null || previousRank > TOP_100_THRESHOLD);

    if (rankCrossedIntoTop100) {
      this.eventEmitter.emit(
        PlayerEnteredTop100Event.name,
        new PlayerEnteredTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
      return;
    }

    const wasRankedInTop100 = previousRank !== null && previousRank <= TOP_100_THRESHOLD;
    const wasNotifiedInTop100 = guest?.top100EnterNotified === true;

    if ((wasRankedInTop100 || wasNotifiedInTop100) && !isInTop100) {
      await this.markTop100EnterNotified(gameId, guestId, false);
      this.eventEmitter.emit(
        PlayerExitedTop100Event.name,
        new PlayerExitedTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
      return;
    }

    if (!isInTop100 && wasNotifiedInTop100) {
      await this.markTop100EnterNotified(gameId, guestId, false);
    }
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

    if (!guest?.top100EnterNotified) {
      return;
    }

    await this.markTop100EnterNotified(gameId, guestAtRank100BeforeId, false);

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

  private async markTop100EnterNotified(
    gameId: GameId,
    guestId: string,
    top100EnterNotified: boolean,
  ): Promise<void> {
    await this.prisma.guestPlayer.update({
      where: {
        gameId_id: {
          gameId,
          id: guestId,
        },
      },
      data: { top100EnterNotified },
    });
  }
}
