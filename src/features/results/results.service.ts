import { Injectable, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedGuest } from '@/common/decorators';
import { getGameConfig, validateGameId } from '@/common/constants';
import { ResultsRepository } from '@/features/results/results.repository';
import { buildReplayPayload, verifyReplaySignature } from '@/common/utils';
import { SubmitResultBatchDto } from '@/features/results/dto/submit-result-batch.dto';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { LeaderboardRankTrackerService } from '@/features/leaderboard/leaderboard-rank-tracker.service';

export interface RejectedResultItem {
  clientResultId: string;
  reason: 'invalid_signature';
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly resultsRepository: ResultsRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
    private readonly rankTracker: LeaderboardRankTrackerService,
  ) {}

  async submitResults(guest: AuthenticatedGuest, dto: SubmitResultBatchDto) {
    const gameId = validateGameId(dto.gameId);

    if (guest.gameId !== gameId) {
      throw new ForbiddenException('Guest does not belong to this game');
    }

    const rejected: RejectedResultItem[] = [];
    const validItems: SubmitResultBatchDto['items'] = [];
    const replaySecret = getGameConfig(gameId).replaySecret;

    for (const item of dto.items) {
      const payload = buildReplayPayload({
        gameId,
        score: item.score,
        guestId: guest.guestId,
        playedAt: item.playedAt,
        clientResultId: item.clientResultId,
      });

      if (verifyReplaySignature(replaySecret, payload, item.signature)) {
        validItems.push(item);
      } else {
        rejected.push({ clientResultId: item.clientResultId, reason: 'invalid_signature' });
      }
    }

    const batchResult = await this.resultsRepository.submitValidatedBatch(
      gameId,
      guest.guestId,
      validItems.map((item) => ({
        ...item,
        signature: item.signature,
      })),
    );

    if (
      batchResult.newBest !== null &&
      batchResult.insertedCount > 0 &&
      batchResult.newBest > (batchResult.previousBest ?? -Infinity)
    ) {
      await this.rankTracker.onScoreUpdated(gameId, guest.guestId, {
        previousRank: batchResult.previousRank,
        guestAtRank100BeforeGuestId: batchResult.guestAtRank100BeforeGuestId,
      });
    }

    const rankInfo = await this.rankResolver.resolveRank(gameId, guest.guestId);

    return {
      rejectedCount: rejected.length,
      insertedCount: batchResult.insertedCount,
      rejected: rejected.length > 0 ? rejected : undefined,
      ...(rankInfo ? { rank: rankInfo.rank, bestScore: rankInfo.bestScore } : {}),
    };
  }
}
