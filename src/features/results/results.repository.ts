import { Injectable } from '@nestjs/common';
import { GameId, Prisma } from '@prisma/client';

import { dedupLockKey } from '@/common/utils';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { SubmitResultDto } from '@/features/results/dto/submit-result.dto';

export interface ValidatedResultItem extends SubmitResultDto {
  replayHash: string;
}

export interface BatchSubmitResult {
  insertedCount: number;
  newBest: number | null;
  previousBest: number | null;
}

@Injectable()
export class ResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async submitValidatedBatch(
    gameId: GameId,
    guestId: string,
    items: ValidatedResultItem[],
  ): Promise<BatchSubmitResult> {
    if (items.length === 0) {
      return { insertedCount: 0, newBest: null, previousBest: null };
    }

    return this.prisma.$transaction(async (tx) => {
      let insertedCount = 0;
      const insertedScores: number[] = [];

      for (const item of items) {
        const lockKey = dedupLockKey(gameId, guestId, item.clientResultId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

        const existing = await tx.gameResult.findFirst({
          where: {
            gameId,
            guestId,
            clientResultId: item.clientResultId,
          },
          select: { id: true },
        });

        if (existing) {
          continue;
        }

        await tx.gameResult.create({
          data: {
            gameId,
            guestId,
            score: item.score,
            replayHash: item.replayHash,
            clientResultId: item.clientResultId,
            metadata: item.metadata as Prisma.InputJsonValue | undefined,
            playedAt: item.playedAt ? new Date(item.playedAt) : undefined,
          },
        });

        insertedCount++;
        insertedScores.push(item.score);
      }

      if (insertedCount === 0) {
        return { insertedCount: 0, newBest: null, previousBest: null };
      }

      const previousRow = await tx.leaderboard.findUnique({
        where: { gameId_guestId: { gameId, guestId } },
        select: { bestScore: true },
      });
      const previousBest = previousRow?.bestScore ?? null;

      const maxScore = Math.max(...insertedScores);

      await tx.$executeRaw`
        INSERT INTO leaderboards ("gameId", "guestId", "bestScore", "updatedAt")
        VALUES (${gameId}::"GameId", ${guestId}, ${maxScore}, now())
        ON CONFLICT ("gameId", "guestId")
        DO UPDATE SET
          "bestScore" = GREATEST(leaderboards."bestScore", EXCLUDED."bestScore"),
          "updatedAt" = now()
        WHERE EXCLUDED."bestScore" > leaderboards."bestScore"
      `;

      const row = await tx.leaderboard.findUnique({
        where: { gameId_guestId: { gameId, guestId } },
        select: { bestScore: true },
      });

      return {
        insertedCount,
        previousBest,
        newBest: row?.bestScore ?? maxScore,
      };
    });
  }

  getTopLeaderboardEntries(gameId: GameId, limit: number) {
    return this.prisma.leaderboard.findMany({
      take: limit,
      where: { gameId },
      select: { guestId: true, bestScore: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });
  }

  countLeaderboard(gameId: GameId) {
    return this.prisma.leaderboard.count({ where: { gameId } });
  }

  getGuestBestScore(gameId: GameId, guestId: string) {
    return this.prisma.leaderboard.findUnique({
      where: { gameId_guestId: { gameId, guestId } },
      select: { bestScore: true },
    });
  }

  countBetterScores(gameId: GameId, bestScore: number) {
    return this.prisma.leaderboard.count({
      where: {
        gameId,
        bestScore: { gt: bestScore },
      },
    });
  }

  async getGuestAtRank(gameId: GameId, rank: number) {
    if (rank < 1) {
      return null;
    }

    const rows = await this.prisma.leaderboard.findMany({
      take: 1,
      skip: rank - 1,
      where: { gameId },
      select: { guestId: true, bestScore: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      rank,
      guestId: row.guestId,
      bestScore: row.bestScore,
    };
  }
}
