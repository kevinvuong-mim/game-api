import { Injectable } from '@nestjs/common';
import { GameId, Prisma } from '@prisma/client';

import { dedupLockKey } from '@/common/utils';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PartitionService } from '@/infra/maintenance/partition.service';
import type { SubmitResultDto } from '@/features/results/dto/submit-result.dto';

export interface ValidatedResultItem extends SubmitResultDto {
  signature: string;
}

export interface BatchSubmitResult {
  insertedCount: number;
  newBest: number | null;
  previousBest: number | null;
  previousRank: number | null;
  /** Submitting guest rank after this batch (computed inside the same TX). */
  currentRank: number | null;
  guestAtRank100BeforeGuestId: string | null;
  /** Rank of the pre-update #100 guest after this batch (same TX), if tracked. */
  displacedGuestRank: number | null;
  displacedGuestBestScore: number | null;
}

@Injectable()
export class ResultsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partitionService: PartitionService,
  ) {}

  async submitValidatedBatch(
    gameId: GameId,
    guestId: string,
    items: ValidatedResultItem[],
  ): Promise<BatchSubmitResult> {
    if (items.length === 0) {
      return emptyBatchResult();
    }

    return this.prisma.$transaction(async (tx) => {
      await this.partitionService.ensurePartitionForInsertDate(new Date(), tx);

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
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          continue;
        }

        await tx.gameResult.create({
          data: {
            gameId,
            guestId,
            score: item.score,
            signature: item.signature,
            clientResultId: item.clientResultId,
            metadata: item.metadata as Prisma.InputJsonValue | undefined,
            playedAt: item.playedAt ? new Date(item.playedAt) : undefined,
          },
        });

        insertedCount++;
        insertedScores.push(item.score);
      }

      if (insertedCount === 0) {
        return emptyBatchResult();
      }

      const previousRow = await tx.leaderboard.findUnique({
        where: { gameId_guestId: { gameId, guestId } },
        select: { bestScore: true },
      });
      const previousBest = previousRow?.bestScore ?? null;
      // Same tie-break as countBetterRanks: bestScore DESC, guestId ASC.
      const previousRank =
        previousBest !== null
          ? (await countBetterRanksTx(tx, gameId, guestId, previousBest)) + 1
          : null;
      const guestAtRank100 = await tx.leaderboard.findMany({
        take: 1,
        skip: 99,
        where: { gameId },
        select: { guestId: true },
        orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
      });
      const guestAtRank100BeforeGuestId = guestAtRank100[0]?.guestId ?? null;

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
      const newBest = row?.bestScore ?? maxScore;
      const currentRank = (await countBetterRanksTx(tx, gameId, guestId, newBest)) + 1;

      let displacedGuestRank: number | null = null;
      let displacedGuestBestScore: number | null = null;
      if (guestAtRank100BeforeGuestId && guestAtRank100BeforeGuestId !== guestId) {
        const displaced = await tx.leaderboard.findUnique({
          where: {
            gameId_guestId: { gameId, guestId: guestAtRank100BeforeGuestId },
          },
          select: { bestScore: true },
        });
        if (displaced) {
          displacedGuestBestScore = displaced.bestScore;
          displacedGuestRank =
            (await countBetterRanksTx(
              tx,
              gameId,
              guestAtRank100BeforeGuestId,
              displaced.bestScore,
            )) + 1;
        }
      }

      return {
        previousBest,
        previousRank,
        currentRank,
        insertedCount,
        guestAtRank100BeforeGuestId,
        displacedGuestRank,
        displacedGuestBestScore,
        newBest,
      };
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

  /** Ranks ahead of this guest under (bestScore DESC, guestId ASC). */
  countBetterRanks(gameId: GameId, guestId: string, bestScore: number) {
    return this.prisma.leaderboard.count({
      where: {
        gameId,
        OR: [{ bestScore: { gt: bestScore } }, { bestScore, guestId: { lt: guestId } }],
      },
    });
  }
}

function emptyBatchResult(): BatchSubmitResult {
  return {
    newBest: null,
    insertedCount: 0,
    previousBest: null,
    previousRank: null,
    currentRank: null,
    guestAtRank100BeforeGuestId: null,
    displacedGuestRank: null,
    displacedGuestBestScore: null,
  };
}

function countBetterRanksTx(
  tx: Prisma.TransactionClient,
  gameId: GameId,
  guestId: string,
  bestScore: number,
) {
  return tx.leaderboard.count({
    where: {
      gameId,
      OR: [{ bestScore: { gt: bestScore } }, { bestScore, guestId: { lt: guestId } }],
    },
  });
}
