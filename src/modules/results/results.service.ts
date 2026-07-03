import { ForbiddenException, Injectable } from '@nestjs/common';

import { getGameConfig, validateGameId } from '@/common/constants';
import { buildReplayPayload, verifyReplaySignature } from '@/common/utils';
import type { AuthenticatedGuest } from '@/common/decorators';
import { RedisService } from '@/modules/redis/redis.service';
import { SubmitResultBatchDto } from '@/modules/results/dto/submit-result-batch.dto';
import { ResultsRepository } from '@/modules/results/results.repository';

@Injectable()
export class ResultsService {
  constructor(
    private readonly resultsRepository: ResultsRepository,
    private readonly redisService: RedisService,
  ) {}

  async submitResults(routeGameId: string, guest: AuthenticatedGuest, dto: SubmitResultBatchDto) {
    const gameId = validateGameId(routeGameId);

    if (guest.gameId !== gameId) {
      throw new ForbiddenException('Guest does not belong to this game');
    }

    const replaySecret = getGameConfig(gameId).replaySecret;
    const validItems = dto.items.filter((item) => {
      const payload = buildReplayPayload({
        gameId,
        guestId: guest.guestId,
        clientResultId: item.clientResultId,
        score: item.score,
        playedAt: item.playedAt,
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
      success: true,
      insertedCount,
      message: 'Results submitted',
    };
  }
}
