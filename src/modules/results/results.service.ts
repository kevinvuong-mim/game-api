import { Injectable, ForbiddenException } from '@nestjs/common';

import { RedisService } from '@/modules/redis/redis.service';
import type { AuthenticatedGuest } from '@/common/decorators';
import { getGameConfig, validateGameId } from '@/common/constants';
import { ResultsRepository } from '@/modules/results/results.repository';
import { buildReplayPayload, verifyReplaySignature } from '@/common/utils';
import { SubmitResultBatchDto } from '@/modules/results/dto/submit-result-batch.dto';

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
    const validItems = dto.items.filter((item) => {
      const payload = buildReplayPayload({
        gameId,
        score: item.score,
        guestId: guest.guestId,
        playedAt: item.playedAt,
        clientResultId: item.clientResultId,
      });

      return verifyReplaySignature(replaySecret, payload, item.signature);
    });

    let insertedCount = 0;
    const insertedScores: number[] = [];

    for (const item of validItems) {
      const inserted = await this.resultsRepository.insertResultAtomic(gameId, guest.guestId, {
        ...item,
        replayHash: item.signature,
      });

      if (inserted) {
        insertedCount++;
        insertedScores.push(item.score);
      }
    }

    if (insertedCount > 0) {
      const previousBest = await this.resultsRepository.getGuestBestScore(gameId, guest.guestId);
      const maxScore = Math.max(...insertedScores);
      const newBest = await this.resultsRepository.upsertLeaderboardBestScore(
        gameId,
        guest.guestId,
        maxScore,
      );

      if (newBest > (previousBest?.bestScore ?? -Infinity)) {
        await this.redisService.updateLeaderboardScore(gameId, guest.guestId, newBest);
      }
    }

    return {
      insertedCount,
      success: true,
      message: 'Results submitted',
    };
  }
}
