import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';

import { Guest, RateLimit, type AuthenticatedGuest } from '@/common/decorators';
import { GuestAuthGuard, RateLimitGuard } from '@/common/guards';
import { InitGuestDto } from '@/modules/guest/dto/init-guest.dto';
import { UpdateNameDto } from '@/modules/guest/dto/update-name.dto';
import { GuestService } from '@/modules/guest/guest.service';

@Controller('guest')
export class GuestController {
  constructor(private readonly guestService: GuestService) {}

  @Post('init')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: 'rate:init:',
    keySource: 'ip',
    limit: Number(process.env.RATE_LIMIT_INIT ?? 5),
    windowSeconds: 60,
  })
  initGuest(@Body() dto: InitGuestDto) {
    return this.guestService.initializeGuest(dto);
  }

  @Patch('name')
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    keyPrefix: 'rate:name:',
    keySource: 'guest',
    limit: Number(process.env.RATE_LIMIT_NAME ?? 10),
    windowSeconds: 60,
  })
  updateName(@Body() dto: UpdateNameDto, @Guest() guest: AuthenticatedGuest) {
    return this.guestService.updateName(guest.guestId, guest.gameId, dto.name);
  }
}
