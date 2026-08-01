import { Injectable } from '@nestjs/common';
import { GameId, Prisma } from '@prisma/client';

import { dedupLockKey } from '@/common/utils';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PartitionService } from '@/infra/maintenance/partition.service';
import type { SubmitResultDto } from '@/features/results/dto/submit-result.dto';
import { LeaderboardScoreApplyService } from '@/features/leaderboard/leaderboard-score-apply.service';

export interface ValidatedResultItem extends SubmitResultDto {
  signature: string;
}

export interface BatchSubmitResult {
  insertedCount: number;
  newBest: number | null;
  /** Submitting guest rank after this batch (computed inside the same TX). */
  currentRank: number | null;
  previousBest: number | null;
  /** Rank of the pre-update #100 guest after this batch (same TX), if tracked. */
  displacedGuestRank: number | null;
  displacedGuestBestScore: number | null;
  guestAtRank100BeforeGuestId: string | null;
}

@Injectable()
export class ResultsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partitionService: PartitionService,
    private readonly leaderboardScoreApply: LeaderboardScoreApplyService,
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

      const maxScore = Math.max(...insertedScores);
      const delta = await this.leaderboardScoreApply.applyBestScoreAndCollectDelta(
        tx,
        gameId,
        guestId,
        maxScore,
      );

      return {
        insertedCount,
        ...delta,
      };
    });
  }
}

function emptyBatchResult(): BatchSubmitResult {
  return {
    newBest: null,
    insertedCount: 0,
    currentRank: null,
    previousBest: null,
    displacedGuestRank: null,
    displacedGuestBestScore: null,
    guestAtRank100BeforeGuestId: null,
  };
}
