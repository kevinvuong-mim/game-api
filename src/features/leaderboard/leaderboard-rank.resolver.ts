import { Injectable } from '@nestjs/common';

import { type GameId } from '@/common/constants';
import { ResultsRepository } from '@/features/results/results.repository';

export interface GuestRankInfo {
  rank: number;
  bestScore: number;
}

@Injectable()
export class LeaderboardRankResolverService {
  constructor(private readonly resultsRepository: ResultsRepository) {}

  async resolveRank(gameId: GameId, guestId: string): Promise<GuestRankInfo | null> {
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
}
