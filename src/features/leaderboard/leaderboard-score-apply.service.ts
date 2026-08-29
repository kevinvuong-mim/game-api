import { Injectable } from '@nestjs/common';
import { GameId, Prisma } from '@prisma/client';

import { leaderboardLockKey } from '@/common/utils';
import { TOP_100_THRESHOLD } from '@/common/constants';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';

export interface LeaderboardScoreDelta {
  newBest: number;
  currentRank: number;
  previousBest: number | null;
  displacedGuestRank: number | null;
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

    if (previousBest !== null && candidateScore <= previousBest) {
      return this.unchangedBest(tx, gameId, guestId, previousBest);
    }

    // Serialize Top-100 snapshots + upserts per game so concurrent submits cannot
    // both read the same #100 guest and emit duplicate exit notifications.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${leaderboardLockKey(gameId)})`;

    const previousAfterLock = await this.leaderboardRepository.getGuestBestScoreTx(
      tx,
      gameId,
      guestId,
    );
    const previousBestAfterLock = previousAfterLock?.bestScore ?? null;

    if (previousBestAfterLock !== null && candidateScore <= previousBestAfterLock) {
      return this.unchangedBest(tx, gameId, guestId, previousBestAfterLock);
    }

    if (previousBestAfterLock !== null) {
      const previousRank = await this.resolveRankFromScoreTx(
        tx,
        gameId,
        guestId,
        previousBestAfterLock,
      );
      if (previousRank <= TOP_100_THRESHOLD) {
        return this.upsertNewBest(tx, gameId, guestId, candidateScore, previousBestAfterLock);
      }
    }

    const guestAtRank100 = await this.leaderboardRepository.findGuestAtRankTx(
      tx,
      gameId,
      TOP_100_THRESHOLD,
    );
    const guestAtRank100BeforeGuestId = guestAtRank100[0]?.guestId ?? null;

    const applied = await this.upsertNewBest(
      tx,
      gameId,
      guestId,
      candidateScore,
      previousBestAfterLock,
    );

    let displacedGuestRank: number | null = null;
    if (guestAtRank100BeforeGuestId && guestAtRank100BeforeGuestId !== guestId) {
      const displaced = await this.leaderboardRepository.getGuestBestScoreTx(
        tx,
        gameId,
        guestAtRank100BeforeGuestId,
      );
      if (displaced) {
        displacedGuestRank = await this.resolveRankFromScoreTx(
          tx,
          gameId,
          guestAtRank100BeforeGuestId,
          displaced.bestScore,
        );
      }
    }

    return {
      ...applied,
      displacedGuestRank,
      guestAtRank100BeforeGuestId,
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

  private async unchangedBest(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
    bestScore: number,
  ): Promise<LeaderboardScoreDelta> {
    const currentRank = await this.resolveRankFromScoreTx(tx, gameId, guestId, bestScore);
    return {
      newBest: bestScore,
      currentRank,
      previousBest: bestScore,
      displacedGuestRank: null,
      guestAtRank100BeforeGuestId: null,
    };
  }

  private async upsertNewBest(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
    candidateScore: number,
    previousBest: number | null,
  ): Promise<LeaderboardScoreDelta> {
    await this.leaderboardRepository.upsertBestScoreTx(tx, gameId, guestId, candidateScore);
    const row = await this.leaderboardRepository.getGuestBestScoreTx(tx, gameId, guestId);
    const newBest = row?.bestScore ?? candidateScore;
    const currentRank = await this.resolveRankFromScoreTx(tx, gameId, guestId, newBest);
    return {
      newBest,
      currentRank,
      previousBest,
      displacedGuestRank: null,
      guestAtRank100BeforeGuestId: null,
    };
  }
}
