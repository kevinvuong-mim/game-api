import { Body, Post, Patch, Delete, Controller, UseGuards } from '@nestjs/common';

import { RATE_LIMITS } from '@/common/constants';
import { GuestAuthGuard, RateLimitGuard } from '@/common/guards';
import { Guest, RateLimit, type AuthenticatedGuest } from '@/common/decorators';
import { UpdateDeviceDto } from '@/modules/notifications/dto/update-device.dto';
import { RegisterDeviceDto } from '@/modules/notifications/dto/register-device.dto';
import { DeviceTokenService } from '@/modules/notifications/services/device-token.service';
import { DeviceNotificationPreferenceDto } from '@/modules/notifications/dto/device-notification-preference.dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post()
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:device:',
    limit: RATE_LIMITS.device,
  })
  registerDevice(@Body() dto: RegisterDeviceDto, @Guest() guest: AuthenticatedGuest) {
    return this.deviceTokenService.registerDevice(guest, dto);
  }

  @Patch()
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:device:',
    limit: RATE_LIMITS.device,
  })
  updateDevice(@Body() dto: UpdateDeviceDto, @Guest() guest: AuthenticatedGuest) {
    return this.deviceTokenService.updateDevice(guest, dto);
  }

  @Delete()
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:device:',
    limit: RATE_LIMITS.device,
  })
  unregisterDevice(@Guest() guest: AuthenticatedGuest) {
    return this.deviceTokenService.unregisterDevice(guest);
  }

  @Patch('heartbeat')
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:device:',
    limit: RATE_LIMITS.device,
  })
  heartbeat(@Guest() guest: AuthenticatedGuest) {
    return this.deviceTokenService.heartbeat(guest);
  }

  @Patch('preferences')
  @UseGuards(GuestAuthGuard, RateLimitGuard)
  @RateLimit({
    windowSeconds: 60,
    keySource: 'guest',
    keyPrefix: 'rate:device:',
    limit: RATE_LIMITS.device,
  })
  setPreferences(
    @Body() dto: DeviceNotificationPreferenceDto,
    @Guest() guest: AuthenticatedGuest,
  ) {
    return this.deviceTokenService.setNotificationPreference(guest, dto.enabled);
  }
}
