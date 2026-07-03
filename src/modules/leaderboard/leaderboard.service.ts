import { Injectable } from '@nestjs/common';
import { GameId } from '@prisma/client';

import { validateGameId } from '@/common/constants';
import { RedisService } from '@/modules/redis/redis.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { ResultsRepository } from '@/modules/results/results.repository';
import { LeaderboardQueryDto } from '@/modules/leaderboard/dto/leaderboard-query.dto';

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
        name: names.get(entry.guestId) ?? null,
        bestScore: entry.bestScore,
      })),
      self,
    };
  }

  private async fetchLeaderboardItems(gameId: GameId, offset: number, limit: number) {
    try {
      await this.ensureLeaderboardCache(gameId);
      const cacheCount = await this.redisService.getLeaderboardCount(gameId);

      if (cacheCount > 0 && offset < cacheCount) {
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

    const maxEntries = Number(process.env.LEADERBOARD_CACHE_MAX ?? 1000);
    const entries = await this.resultsRepository.getTopLeaderboardEntries(gameId, maxEntries);
    await this.redisService.rebuildLeaderboard(gameId, entries);
  }

  private async fetchLeaderboardFromDb(gameId: GameId, offset: number, limit: number) {
    const rows = await this.prisma.leaderboard.findMany({
      where: { gameId },
      orderBy: [{ bestScore: 'desc' }],
      skip: offset,
      take: limit,
      select: { guestId: true, bestScore: true },
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
