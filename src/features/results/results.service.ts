import { Logger, Injectable, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedGuest } from '@/common/decorators';
import { type GameId, TOP_100_THRESHOLD } from '@/common/constants';
import { ResultsRepository } from '@/features/results/results.repository';
import { SubmitResultBatchDto } from '@/features/results/dto/submit-result-batch.dto';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly resultsRepository: ResultsRepository,
    private readonly rankResolver: LeaderboardRankResolverService,
    private readonly notificationDelivery: NotificationDeliveryService,
  ) {}

  async submitResults(guest: AuthenticatedGuest, dto: SubmitResultBatchDto) {
    const gameId = dto.gameId;

    if (guest.gameId !== gameId) {
      throw new ForbiddenException('Guest does not belong to this game');
    }

    const batchResult = await this.resultsRepository.submitValidatedBatch(
      gameId,
      guest.guestId,
      dto.items,
    );

    if (
      batchResult.newBest !== null &&
      batchResult.insertedCount > 0 &&
      batchResult.newBest > (batchResult.previousBest ?? -Infinity)
    ) {
      this.notifyTop100ExitIfNeeded(gameId, guest.guestId, batchResult);
    }

    // Prefer ranks computed inside the submit TX; fall back when nothing inserted.
    const rankInfo =
      batchResult.currentRank !== null && batchResult.newBest !== null
        ? { rank: batchResult.currentRank, bestScore: batchResult.newBest }
        : await this.rankResolver.resolveRank(gameId, guest.guestId);

    return {
      insertedCount: batchResult.insertedCount,
      ...(rankInfo ? { rank: rankInfo.rank, bestScore: rankInfo.bestScore } : {}),
    };
  }

  private notifyTop100ExitIfNeeded(
    gameId: GameId,
    submitterGuestId: string,
    batchResult: {
      displacedGuestRank: number | null;
      guestAtRank100BeforeGuestId: string | null;
    },
  ): void {
    const displacedGuestId = batchResult.guestAtRank100BeforeGuestId;
    if (!displacedGuestId || displacedGuestId === submitterGuestId) {
      return;
    }

    if (
      batchResult.displacedGuestRank === null ||
      batchResult.displacedGuestRank <= TOP_100_THRESHOLD
    ) {
      return;
    }

    void this.notificationDelivery
      .sendTop100Exited(gameId, displacedGuestId, batchResult.displacedGuestRank)
      .catch((error: unknown) => {
        this.logger.warn(`Failed to send top_100_exited for guest ${displacedGuestId}`, error);
      });
  }
}
