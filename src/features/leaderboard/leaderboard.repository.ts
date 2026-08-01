import { Injectable } from '@nestjs/common';
import { GameId, Prisma } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';

/** Tie-break: bestScore DESC, guestId ASC. */
export function betterRanksWhere(gameId: GameId, guestId: string, bestScore: number) {
  return {
    gameId,
    OR: [{ bestScore: { gt: bestScore } }, { bestScore, guestId: { lt: guestId } }],
  };
}

@Injectable()
export class LeaderboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  count(gameId: GameId) {
    return this.prisma.leaderboard.count({ where: { gameId } });
  }

  getGuestBestScore(gameId: GameId, guestId: string) {
    return this.prisma.leaderboard.findUnique({
      where: { gameId_guestId: { gameId, guestId } },
      select: { bestScore: true },
    });
  }

  countBetterRanks(gameId: GameId, guestId: string, bestScore: number) {
    return this.prisma.leaderboard.count({
      where: betterRanksWhere(gameId, guestId, bestScore),
    });
  }

  findPage(gameId: GameId, offset: number, limit: number) {
    return this.prisma.leaderboard.findMany({
      take: limit,
      skip: offset,
      where: { gameId },
      select: { guestId: true, bestScore: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });
  }

  getGuestBestScoreTx(tx: Prisma.TransactionClient, gameId: GameId, guestId: string) {
    return tx.leaderboard.findUnique({
      where: { gameId_guestId: { gameId, guestId } },
      select: { bestScore: true },
    });
  }

  countBetterRanksTx(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
    bestScore: number,
  ) {
    return tx.leaderboard.count({
      where: betterRanksWhere(gameId, guestId, bestScore),
    });
  }

  findGuestAtRankTx(tx: Prisma.TransactionClient, gameId: GameId, rank: number) {
    return tx.leaderboard.findMany({
      take: 1,
      skip: rank - 1,
      where: { gameId },
      select: { guestId: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });
  }

  async upsertBestScoreTx(
    tx: Prisma.TransactionClient,
    gameId: GameId,
    guestId: string,
    score: number,
  ) {
    await tx.$executeRaw`
      INSERT INTO leaderboards ("gameId", "guestId", "bestScore", "updatedAt")
      VALUES (${gameId}::"GameId", ${guestId}, ${score}, now())
      ON CONFLICT ("gameId", "guestId")
      DO UPDATE SET
        "bestScore" = GREATEST(leaderboards."bestScore", EXCLUDED."bestScore"),
        "updatedAt" = now()
      WHERE EXCLUDED."bestScore" > leaderboards."bestScore"
    `;
  }

  /**
   * Batch-resolve ranks for many guests in one query (same tie-break as countBetterRanks).
   */
  async resolveRanksForGuests(
    gameId: GameId,
    guestIds: string[],
  ): Promise<Array<{ guestId: string; bestScore: number; rank: number }>> {
    if (guestIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ guestId: string; bestScore: number; rank: number | bigint }>
    >`
      SELECT
        s."guestId" AS "guestId",
        s."bestScore" AS "bestScore",
        (
          SELECT COUNT(*)::int FROM leaderboards l
          WHERE l."gameId" = s."gameId"
            AND (
              l."bestScore" > s."bestScore"
              OR (l."bestScore" = s."bestScore" AND l."guestId" < s."guestId")
            )
        ) + 1 AS rank
      FROM leaderboards s
      WHERE s."gameId" = ${gameId}::"GameId"
        AND s."guestId" IN (${Prisma.join(guestIds)})
    `;

    return rows.map((row) => ({
      guestId: row.guestId,
      bestScore: Number(row.bestScore),
      rank: Number(row.rank),
    }));
  }
}
