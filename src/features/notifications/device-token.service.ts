import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedGuest } from '@/common/decorators';
import { UpdateDeviceDto } from '@/features/notifications/dto/update-device.dto';
import { RegisterDeviceDto } from '@/features/notifications/dto/register-device.dto';
import { FcmTokenConflictError, GuestRepository } from '@/features/guest/guest.repository';

@Injectable()
export class DeviceTokenService {
  constructor(private readonly guestRepository: GuestRepository) {}

  async registerDevice(guest: AuthenticatedGuest, dto: RegisterDeviceDto) {
    try {
      const device = await this.guestRepository.registerFcmToken({
        token: dto.token,
        locale: dto.locale,
        gameId: guest.gameId,
        guestId: guest.guestId,
        platform: dto.platform,
      });

      return { guestId: device.id };
    } catch (error) {
      this.mapConflict(error);
      throw error;
    }
  }

  async updateDevice(guest: AuthenticatedGuest, dto: UpdateDeviceDto) {
    try {
      const device = await this.guestRepository.updateFcmToken(
        guest.gameId,
        guest.guestId,
        dto.token,
        dto.locale,
      );

      if (!device) {
        throw new NotFoundException('Device token not found');
      }

      return { guestId: device.id };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.mapConflict(error);
      throw error;
    }
  }

  async unregisterDevice(guest: AuthenticatedGuest) {
    await this.guestRepository.unregisterFcmToken(guest.gameId, guest.guestId);
    return { success: true };
  }

  async getActiveToken(gameId: AuthenticatedGuest['gameId'], guestId: string) {
    return this.guestRepository.findActiveFcmToken(gameId, guestId);
  }

  async markTokenInvalid(token: string) {
    await this.guestRepository.markFcmTokenInvalid(token);
  }

  findActiveTokenBatch(gameId: AuthenticatedGuest['gameId'], cursor?: string, take = 500) {
    return this.guestRepository.findActiveFcmTokenBatch(gameId, cursor, take);
  }

  private mapConflict(error: unknown): void {
    if (error instanceof FcmTokenConflictError) {
      throw new ConflictException(error.message);
    }
  }
}
