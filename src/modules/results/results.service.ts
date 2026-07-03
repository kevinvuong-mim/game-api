import { Injectable, ForbiddenException } from '@nestjs/common';

import { RedisService } from '@/modules/redis/redis.service';
import type { AuthenticatedGuest } from '@/common/decorators';
import { getGameConfig, validateGameId } from '@/common/constants';
import { ResultsRepository } from '@/modules/results/results.repository';
import { buildReplayPayload, verifyReplaySignature } from '@/common/utils';
import { SubmitResultBatchDto } from '@/modules/results/dto/submit-result-batch.dto';

export interface RejectedResultItem {
  clientResultId: string;
  reason: 'invalid_signature';
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly redisService: RedisService,
    private readonly resultsRepository: ResultsRepository,
  ) {}

  async submitResults(guest: AuthenticatedGuest, dto: SubmitResultBatchDto) {
    const gameId = validateGameId(dto.gameId);

    if (guest.gameId !== gameId) {
      throw new ForbiddenException('Guest does not belong to this game');
    }

    const replaySecret = getGameConfig(gameId).replaySecret;
    const validItems: SubmitResultBatchDto['items'] = [];
    const rejected: RejectedResultItem[] = [];

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
        replayHash: item.signature,
      })),
    );

    if (
      batchResult.insertedCount > 0 &&
      batchResult.newBest !== null &&
      batchResult.newBest > (batchResult.previousBest ?? -Infinity)
    ) {
      await this.redisService.updateLeaderboardScore(gameId, guest.guestId, batchResult.newBest);
    }

    return {
      insertedCount: batchResult.insertedCount,
      rejectedCount: rejected.length,
      rejected: rejected.length > 0 ? rejected : undefined,
      success: true,
      message: 'Results submitted',
    };
  }
}
