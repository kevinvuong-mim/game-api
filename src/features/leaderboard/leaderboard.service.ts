import { Injectable } from '@nestjs/common';

import { GameId } from '@/common/constants';
import { requireGameId } from '@/common/utils';
import { GuestRepository } from '@/features/guest/guest.repository';
import { LeaderboardQueryDto } from '@/features/leaderboard/dto/leaderboard-query.dto';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly guestRepository: GuestRepository,
    private readonly leaderboardRepository: LeaderboardRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
  ) {}

  async getLeaderboard(query: LeaderboardQueryDto) {
    const gameId = requireGameId(query.gameId);
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const total = await this.leaderboardRepository.count(gameId);
    const rows = await this.leaderboardRepository.findPage(gameId, offset, limit);
    const items = rows.map((row, index) => ({
      guestId: row.guestId,
      bestScore: row.bestScore,
      rank: offset + index + 1,
    }));

    const names = await this.guestRepository.findNamesByIds(items.map((entry) => entry.guestId));

    let self: { rank: number; bestScore: number } | null = null;
    if (query.guestId) {
      self = await this.resolveSelfRank(gameId, query.guestId);
    }

    return {
      page,
      limit,
      total,
      gameId,
      items: items.map((entry) => ({
        rank: entry.rank,
        guestId: entry.guestId,
        bestScore: entry.bestScore,
        name: names.get(entry.guestId) ?? null,
      })),
      self,
    };
  }

  private async resolveSelfRank(gameId: GameId, guestId: string) {
    const rank = await this.rankResolver.resolveRank(gameId, guestId);
    if (!rank) {
      return null;
    }

    return { rank: rank.rank, bestScore: rank.bestScore };
  }
}
