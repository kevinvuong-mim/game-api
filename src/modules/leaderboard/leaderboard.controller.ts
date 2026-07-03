import { Get, Query, UseGuards, Controller } from '@nestjs/common';

import { RateLimitGuard } from '@/common/guards';
import { RATE_LIMITS } from '@/common/constants';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { LeaderboardService } from '@/modules/leaderboard/leaderboard.service';
import { LeaderboardQueryDto } from '@/modules/leaderboard/dto/leaderboard-query.dto';

@Controller('leaderboards')
@UseGuards(RateLimitGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @RateLimit({
    keySource: 'ip',
    windowSeconds: 60,
    keyPrefix: 'rate:lb:',
    limit: RATE_LIMITS.leaderboard,
  })
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(query);
  }
}
