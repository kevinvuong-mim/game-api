import { Injectable } from '@nestjs/common';

import { type GameId } from '@/common/constants';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';

export interface GuestRankInfo {
  rank: number;
  bestScore: number;
}

@Injectable()
export class LeaderboardRankResolverService {
  constructor(private readonly leaderboardRepository: LeaderboardRepository) {}

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
}
