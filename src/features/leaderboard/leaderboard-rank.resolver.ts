import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { type GameId } from '@/common/constants';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';
import { LeaderboardScoreApplyService } from '@/features/leaderboard/leaderboard-score-apply.service';

export interface GuestRankInfo {
  rank: number;
  bestScore: number;
}

@Injectable()
export class LeaderboardRankResolverService {
  constructor(
    private readonly leaderboardRepository: LeaderboardRepository,
    private readonly scoreApply: LeaderboardScoreApplyService,
  ) {}

  async resolveRank(gameId: GameId, guestId: string): Promise<GuestRankInfo | null> {
    const row = await this.leaderboardRepository.getGuestBestScore(gameId, guestId);
    if (!row) {
      return null;
    }

    const betterCount = await this.leaderboardRepository.countBetterRanks(
      gameId,
      guestId,
      row.bestScore,
    );
    return {
      rank: betterCount + 1,
      bestScore: row.bestScore,
    };
  }

  async resolveRankTx(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
  ): Promise<GuestRankInfo | null> {
    const row = await this.leaderboardRepository.getGuestBestScoreTx(tx, gameId, guestId);
    if (!row) {
      return null;
    }

    const rank = await this.scoreApply.resolveRankFromScoreTx(tx, gameId, guestId, row.bestScore);
    return {
      rank,
      bestScore: row.bestScore,
    };
  }

  async resolveRanks(gameId: GameId, guestIds: string[]): Promise<Map<string, GuestRankInfo>> {
    const rows = await this.leaderboardRepository.resolveRanksForGuests(gameId, guestIds);
    return new Map(rows.map((row) => [row.guestId, { rank: row.rank, bestScore: row.bestScore }]));
  }
}
