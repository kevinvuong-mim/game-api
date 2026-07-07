import { GameId } from '@prisma/client';
import { Injectable } from '@nestjs/common';

import { RedisService } from '@/infra/redis/redis.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ResultsRepository } from '@/features/results/results.repository';
import { validateGameId, LEADERBOARD_CACHE_MAX } from '@/common/constants';
import { LeaderboardQueryDto } from '@/features/leaderboard/dto/leaderboard-query.dto';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly resultsRepository: ResultsRepository,
  ) {}

  async getLeaderboard(query: LeaderboardQueryDto) {
    const gameId = validateGameId(query.gameId) as GameId;
    const page = query.page;
    const limit = Math.min(query.limit, 100);
    const offset = (page - 1) * limit;

    const total = await this.resultsRepository.countLeaderboard(gameId);
    const items = await this.fetchLeaderboardItems(gameId, offset, limit);

    const names = await this.resolveGuestNames(items.map((entry) => entry.guestId));

    let self: { rank: number; bestScore: number } | null = null;
    if (query.guestId) {
      self = await this.resolveSelfRank(gameId, query.guestId);
    }

    return {
      gameId,
      total,
      page,
      limit,
      items: items.map((entry) => ({
        rank: entry.rank,
        guestId: entry.guestId,
        bestScore: entry.bestScore,
        name: names.get(entry.guestId) ?? null,
      })),
      self,
    };
  }

  private async fetchLeaderboardItems(gameId: GameId, offset: number, limit: number) {
    try {
      await this.ensureLeaderboardCache(gameId);
      const cacheCount = await this.redisService.getLeaderboardCount(gameId);

      if (cacheCount > 0 && offset + limit <= cacheCount) {
        return this.redisService.getLeaderboardTop(gameId, offset, limit);
      }
    } catch {
      // Redis miss or down — fall back to PostgreSQL.
    }

    return this.fetchLeaderboardFromDb(gameId, offset, limit);
  }

  private async resolveSelfRank(gameId: GameId, guestId: string) {
    try {
      const cached = await this.redisService.getLeaderboardRank(gameId, guestId);
      if (cached) {
        return { rank: cached.rank, bestScore: cached.bestScore };
      }
    } catch {
      // Redis miss or down — fall back to PostgreSQL.
    }

    return this.getSelfRankFromDb(gameId, guestId);
  }

  private async ensureLeaderboardCache(gameId: GameId) {
    const count = await this.redisService.getLeaderboardCount(gameId);
    if (count > 0) {
      return;
    }

    const entries = await this.resultsRepository.getTopLeaderboardEntries(
      gameId,
      LEADERBOARD_CACHE_MAX,
    );
    await this.redisService.rebuildLeaderboard(gameId, entries);
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

  private async getSelfRankFromDb(gameId: GameId, guestId: string) {
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
