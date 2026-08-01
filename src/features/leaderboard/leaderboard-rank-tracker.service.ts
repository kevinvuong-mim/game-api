import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PlayerExitedTop100Event } from '@/domain/events';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';

export interface ScoreUpdateContext {
  /** Rank after the score write — must be computed in the same DB transaction. */
  currentRank: number | null;
  previousRank: number | null;
  currentBestScore: number | null;
  displacedGuestRank: number | null;
  displacedGuestBestScore: number | null;
  guestAtRank100BeforeGuestId: string | null;
}

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  onScoreUpdated(gameId: GameId, guestId: string, context: ScoreUpdateContext): void {
    this.handleSubmittingGuestExit(gameId, guestId, context);
    this.handleDisplacedGuestExit(gameId, guestId, context);
  }

  private handleSubmittingGuestExit(
    gameId: GameId,
    guestId: string,
    context: ScoreUpdateContext,
  ): void {
    const { previousRank, currentRank, currentBestScore } = context;
    if (currentRank === null || currentBestScore === null) {
      return;
    }

    const isInTop100 = currentRank <= TOP_100_THRESHOLD;
    const wasRankedInTop100 = previousRank !== null && previousRank <= TOP_100_THRESHOLD;

    if (wasRankedInTop100 && !isInTop100) {
      this.eventEmitter.emit(
        PlayerExitedTop100Event.EVENT,
        new PlayerExitedTop100Event(gameId, guestId, currentRank, currentBestScore),
      );
    }
  }

  private handleDisplacedGuestExit(
    gameId: GameId,
    submittingGuestId: string,
    context: ScoreUpdateContext,
  ): void {
    const { guestAtRank100BeforeGuestId, displacedGuestRank, displacedGuestBestScore } = context;

    if (
      !guestAtRank100BeforeGuestId ||
      guestAtRank100BeforeGuestId === submittingGuestId ||
      displacedGuestRank === null ||
      displacedGuestBestScore === null
    ) {
      return;
    }

    if (displacedGuestRank <= TOP_100_THRESHOLD) {
      return;
    }

    this.eventEmitter.emit(
      PlayerExitedTop100Event.EVENT,
      new PlayerExitedTop100Event(
        gameId,
        guestAtRank100BeforeGuestId,
        displacedGuestRank,
        displacedGuestBestScore,
      ),
    );
  }
}
