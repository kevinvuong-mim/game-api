import { Injectable } from '@nestjs/common';

import { GameId, validateGameId } from '@/common/constants';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ResultsRepository } from '@/features/results/results.repository';
import { LeaderboardQueryDto } from '@/features/leaderboard/dto/leaderboard-query.dto';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultsRepository: ResultsRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
  ) {}

  async getLeaderboard(query: LeaderboardQueryDto) {
    const gameId = validateGameId(query.gameId);
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const total = await this.resultsRepository.countLeaderboard(gameId);
    const items = await this.fetchLeaderboardFromDb(gameId, offset, limit);

    const names = await this.resolveGuestNames(items.map((entry) => entry.guestId));

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

  private async fetchLeaderboardFromDb(gameId: GameId, offset: number, limit: number) {
    const rows = await this.prisma.leaderboard.findMany({
      take: limit,
      skip: offset,
      where: { gameId },
      select: { guestId: true, bestScore: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });

    return rows.map((row, index) => ({
      guestId: row.guestId,
      bestScore: row.bestScore,
      rank: offset + index + 1,
    }));
  }

  private async resolveGuestNames(guestIds: string[]) {
    if (guestIds.length === 0) {
      return new Map<string, string | null>();
    }

    const guests = await this.prisma.guestPlayer.findMany({
      where: { id: { in: guestIds } },
      select: { id: true, name: true },
    });

    return new Map(guests.map((guest) => [guest.id, guest.name]));
  }
}
