import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { Guest, RateLimit, type AuthenticatedGuest } from '@/common/decorators';
import { GuestAuthGuard, RateLimitGuard } from '@/common/guards';
import { SubmitResultBatchDto } from '@/modules/results/dto/submit-result-batch.dto';
import { ResultsService } from '@/modules/results/results.service';

@Controller('games/:gameId/results')
@UseGuards(GuestAuthGuard, RateLimitGuard)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Post()
  @RateLimit({
    keyPrefix: 'rate:result:',
    keySource: 'guest',
    limit: Number(process.env.RATE_LIMIT_RESULT ?? 20),
    windowSeconds: 60,
  })
  submitResults(
    @Param('gameId') gameId: string,
    @Body() dto: SubmitResultBatchDto,
    @Guest() guest: AuthenticatedGuest,
  ) {
    return this.resultsService.submitResults(gameId, guest, dto);
  }
}
