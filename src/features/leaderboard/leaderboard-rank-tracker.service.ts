import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PlayerExitedTop100Event } from '@/domain/events';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';

export interface ScoreUpdateContext {
  displacedGuestRank: number | null;
  displacedGuestBestScore: number | null;
  guestAtRank100BeforeGuestId: string | null;
}

@Injectable()
export class LeaderboardRankTrackerService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Best scores only increase (GREATEST), so the submitting guest cannot exit
   * Top 100 via their own submit. Only a displaced former #100 can exit.
   */
  onScoreUpdated(gameId: GameId, submittingGuestId: string, context: ScoreUpdateContext): void {
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
