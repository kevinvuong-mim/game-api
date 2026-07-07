import { Body, Post, UseGuards, Controller } from '@nestjs/common';

import { RATE_LIMITS } from '@/common/constants';
import { GuestAuthGuard, RateLimitGuard } from '@/common/guards';
import { ResultsService } from '@/features/results/results.service';
import { Guest, RateLimit, type AuthenticatedGuest } from '@/common/decorators';
import { SubmitResultBatchDto } from '@/features/results/dto/submit-result-batch.dto';

@Controller('results')
@UseGuards(GuestAuthGuard, RateLimitGuard)
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Post()
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:result:',
    limit: RATE_LIMITS.result,
  })
  submitResults(@Body() dto: SubmitResultBatchDto, @Guest() guest: AuthenticatedGuest) {
    return this.resultsService.submitResults(guest, dto);
  }
}
