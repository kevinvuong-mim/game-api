import { Injectable } from '@nestjs/common';
import { GameId, Prisma } from '@prisma/client';

import { TOP_100_THRESHOLD } from '@/common/constants';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';

export interface LeaderboardScoreDelta {
  newBest: number;
  currentRank: number;
  previousBest: number | null;
  previousRank: number | null;
  displacedGuestRank: number | null;
  displacedGuestBestScore: number | null;
  guestAtRank100BeforeGuestId: string | null;
}

/**
 * Applies a candidate best score inside an open transaction and collects
 * before/after rank fields for Top-100 displacement tracking.
 */
@Injectable()
export class LeaderboardScoreApplyService {
  constructor(private readonly leaderboardRepository: LeaderboardRepository) {}

  async applyBestScoreAndCollectDelta(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
    candidateScore: number,
  ): Promise<LeaderboardScoreDelta> {
    const previousRow = await this.leaderboardRepository.getGuestBestScoreTx(tx, gameId, guestId);
    const previousBest = previousRow?.bestScore ?? null;
    const previousRank =
      previousBest !== null
        ? await this.resolveRankFromScoreTx(tx, gameId, guestId, previousBest)
        : null;

    const guestAtRank100 = await this.leaderboardRepository.findGuestAtRankTx(
      tx,
      gameId,
      TOP_100_THRESHOLD,
    );
    const guestAtRank100BeforeGuestId = guestAtRank100[0]?.guestId ?? null;

    await this.leaderboardRepository.upsertBestScoreTx(tx, gameId, guestId, candidateScore);

    const row = await this.leaderboardRepository.getGuestBestScoreTx(tx, gameId, guestId);
    const newBest = row?.bestScore ?? candidateScore;
    const currentRank = await this.resolveRankFromScoreTx(tx, gameId, guestId, newBest);

    let displacedGuestRank: number | null = null;
    let displacedGuestBestScore: number | null = null;
    if (guestAtRank100BeforeGuestId && guestAtRank100BeforeGuestId !== guestId) {
      const displaced = await this.leaderboardRepository.getGuestBestScoreTx(
        tx,
        gameId,
        guestAtRank100BeforeGuestId,
      );
      if (displaced) {
        displacedGuestBestScore = displaced.bestScore;
        displacedGuestRank = await this.resolveRankFromScoreTx(
          tx,
          gameId,
          guestAtRank100BeforeGuestId,
          displaced.bestScore,
        );
      }
    }

    return {
      previousBest,
      previousRank,
      currentRank,
      guestAtRank100BeforeGuestId,
      displacedGuestRank,
      displacedGuestBestScore,
      newBest,
    };
  }

  /** Shared TX rank formula: betterCount + 1 (same tie-break as non-TX resolver). */
  async resolveRankFromScoreTx(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
    bestScore: number,
  ): Promise<number> {
    const betterCount = await this.leaderboardRepository.countBetterRanksTx(
      tx,
      gameId,
      guestId,
      bestScore,
    );
    return betterCount + 1;
  }
}
