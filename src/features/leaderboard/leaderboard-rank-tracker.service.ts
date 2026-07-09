import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PlayerExitedTop100Event } from '@/domain/events';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

export interface ScoreUpdateContext {
  previousRank: number | null;
  guestAtRank100BeforeGuestId: string | null;
}

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(
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

    this.handleSubmittingGuestExit(gameId, guestId, context.previousRank, currentRank);
    await this.handleDisplacedGuestExit(gameId, guestId, context.guestAtRank100BeforeGuestId);
  }

  private handleSubmittingGuestExit(
    gameId: GameId,
    guestId: string,
    previousRank: number | null,
    currentRank: { rank: number; bestScore: number },
  ): void {
    const isInTop100 = currentRank.rank <= TOP_100_THRESHOLD;
    const wasRankedInTop100 = previousRank !== null && previousRank <= TOP_100_THRESHOLD;

    if (wasRankedInTop100 && !isInTop100) {
      this.eventEmitter.emit(
        PlayerExitedTop100Event.name,
        new PlayerExitedTop100Event(gameId, guestId, currentRank.rank, currentRank.bestScore),
      );
    }
  }

  private async handleDisplacedGuestExit(
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
}
