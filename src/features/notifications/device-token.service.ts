import { Injectable } from '@nestjs/common';

import { RedisService } from '@/infra/redis/redis.service';
import type { AuthenticatedGuest } from '@/common/decorators';
import { UpdateDeviceDto } from '@/features/notifications/dto/update-device.dto';
import { RegisterDeviceDto } from '@/features/notifications/dto/register-device.dto';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
@Injectable()
export class DeviceTokenService {
  constructor(
    private readonly redisService: RedisService,
    private readonly deviceTokenRepository: DeviceTokenRepository,
  ) {}

  async registerDevice(guest: AuthenticatedGuest, dto: RegisterDeviceDto) {
    await this.redisService.setNotificationMuted(guest.gameId, guest.guestId, false);

    const device = await this.deviceTokenRepository.registerDevice({
      token: dto.token,
      locale: dto.locale,
      gameId: guest.gameId,
      guestId: guest.guestId,
      platform: dto.platform,
    });

    return {
      guestId: device.id,
    };
  }

  async updateDevice(guest: AuthenticatedGuest, dto: UpdateDeviceDto) {
    await this.redisService.setNotificationMuted(guest.gameId, guest.guestId, false);

    const device = await this.deviceTokenRepository.updateDeviceToken(
      guest.gameId,
      guest.guestId,
      dto.token,
      dto.locale,
    );

    return {
      guestId: device.id,
    };
  }

  async unregisterDevice(guest: AuthenticatedGuest) {
    await this.deviceTokenRepository.unregisterDevice(guest.gameId, guest.guestId);
    return { success: true };
  }

  async setNotificationPreference(guest: AuthenticatedGuest, enabled: boolean) {
    await this.redisService.setNotificationMuted(guest.gameId, guest.guestId, !enabled);
    return { success: true };
  }

  async getActiveToken(gameId: AuthenticatedGuest['gameId'], guestId: string) {
    return this.deviceTokenRepository.findActiveToken(gameId, guestId);
  }

  async isNotificationMuted(gameId: AuthenticatedGuest['gameId'], guestId: string) {
    return this.redisService.isNotificationMuted(gameId, guestId);
  }

  async markTokenInvalid(token: string) {
    await this.deviceTokenRepository.markTokenInvalid(token);
  }

  localeToCode(locale: { toString(): string }): 'en' | 'vi' {
    return locale.toString() === 'VI' ? 'vi' : 'en';
  }
}
