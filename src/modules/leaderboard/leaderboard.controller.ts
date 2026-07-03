import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '@/common/guards';
import { LeaderboardQueryDto } from '@/modules/leaderboard/dto/leaderboard-query.dto';
import { LeaderboardService } from '@/modules/leaderboard/leaderboard.service';

@Controller('leaderboards')
@UseGuards(RateLimitGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @RateLimit({
    keyPrefix: 'rate:lb:',
    keySource: 'ip',
    limit: Number(process.env.RATE_LIMIT_LEADERBOARD ?? 30),
    windowSeconds: 60,
  })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(query);
  }
}
