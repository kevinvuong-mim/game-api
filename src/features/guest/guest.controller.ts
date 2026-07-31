import { Body, Post, Patch, UseGuards, Controller } from '@nestjs/common';

import { RATE_LIMITS } from '@/common/constants';
import { GuestService } from '@/features/guest/guest.service';
import { GuestAuthGuard, RateLimitGuard } from '@/common/guards';
import { InitGuestDto } from '@/features/guest/dto/init-guest.dto';
import { UpdateNameDto } from '@/features/guest/dto/update-name.dto';
import { Guest, RateLimit, type AuthenticatedGuest } from '@/common/decorators';

@Controller('guest')
export class GuestController {
  constructor(private readonly guestService: GuestService) {}

  @Post('init')
  @UseGuards(RateLimitGuard)
  @RateLimit(
    {
      keySource: 'ip',
      windowSeconds: 60,
      keyPrefix: 'rate:init:',
      limit: RATE_LIMITS.init,
    },
    {
      keySource: 'ip',
      windowSeconds: 3600,
      keyPrefix: 'rate:init:h:',
      limit: RATE_LIMITS.initHourly,
    },
  )
  initGuest(@Body() dto: InitGuestDto) {
    return this.guestService.initializeGuest(dto);
  }

  @Patch('name')
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:name:',
    limit: RATE_LIMITS.name,
  })
  updateName(@Body() dto: UpdateNameDto, @Guest() guest: AuthenticatedGuest) {
    return this.guestService.updateName(guest.guestId, guest.gameId, dto.name);
  }
}
