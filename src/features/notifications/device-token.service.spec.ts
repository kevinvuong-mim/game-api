import { ConflictException, NotFoundException } from '@nestjs/common';
import { DevicePlatform, GameId, NotificationLocale } from '@prisma/client';

import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { FcmTokenConflictError, type GuestRepository } from '@/features/guest/guest.repository';

const guest = { guestId: 'g1', gameId: GameId.FRULOOP };

describe('DeviceTokenService', () => {
  const guestRepository = {
    registerFcmToken: jest.fn(),
    updateFcmToken: jest.fn(),
    unregisterFcmToken: jest.fn(),
    findActiveFcmToken: jest.fn(),
    markFcmTokenInvalid: jest.fn(),
    findActiveFcmTokenBatch: jest.fn(),
  };
  let service: DeviceTokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceTokenService(guestRepository as unknown as GuestRepository);
  });

  it('registers a device and returns the guest id', async () => {
    guestRepository.registerFcmToken.mockResolvedValue({ id: 'g1' });
    const dto = {
      token: 'tok',
      platform: DevicePlatform.IOS,
      locale: NotificationLocale.EN,
    };

    await expect(service.registerDevice(guest, dto)).resolves.toEqual({ guestId: 'g1' });
    expect(guestRepository.registerFcmToken).toHaveBeenCalledWith({
      token: 'tok',
      locale: NotificationLocale.EN,
      gameId: GameId.FRULOOP,
      guestId: 'g1',
      platform: DevicePlatform.IOS,
    });
  });

  it('maps FCM unique conflicts to ConflictException', async () => {
    guestRepository.registerFcmToken.mockRejectedValue(new FcmTokenConflictError());

    await expect(
      service.registerDevice(guest, {
        token: 'tok',
        platform: DevicePlatform.ANDROID,
        locale: NotificationLocale.VI,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows unexpected register errors', async () => {
    guestRepository.registerFcmToken.mockRejectedValue(new Error('db'));

    await expect(
      service.registerDevice(guest, {
        token: 'tok',
        platform: DevicePlatform.IOS,
        locale: NotificationLocale.EN,
      }),
    ).rejects.toThrow('db');
  });

  it('updates a registered token', async () => {
    guestRepository.updateFcmToken.mockResolvedValue({ id: 'g1' });

    await expect(
      service.updateDevice(guest, { token: 'new', locale: NotificationLocale.VI }),
    ).resolves.toEqual({ guestId: 'g1' });
  });

  it('throws NotFoundException when the guest has no token to update', async () => {
    guestRepository.updateFcmToken.mockResolvedValue(null);

    await expect(
      service.updateDevice(guest, { token: 'new', locale: NotificationLocale.EN }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps update conflicts and rethrows other errors', async () => {
    guestRepository.updateFcmToken.mockRejectedValue(new FcmTokenConflictError());
    await expect(
      service.updateDevice(guest, { token: 'new', locale: NotificationLocale.EN }),
    ).rejects.toBeInstanceOf(ConflictException);

    guestRepository.updateFcmToken.mockRejectedValue(new Error('db'));
    await expect(
      service.updateDevice(guest, { token: 'new', locale: NotificationLocale.EN }),
    ).rejects.toThrow('db');
  });

  it('unregisters, looks up, invalidates, and batches tokens', async () => {
    guestRepository.findActiveFcmToken.mockResolvedValue({ fcmToken: 'tok' });
    guestRepository.findActiveFcmTokenBatch.mockResolvedValue([]);

    await expect(service.unregisterDevice(guest)).resolves.toEqual({ success: true });
    await expect(service.getActiveToken(GameId.FRULOOP, 'g1')).resolves.toEqual({
      fcmToken: 'tok',
    });
    await service.markTokenInvalid('tok');
    await service.findActiveTokenBatch(GameId.FRULOOP, 'c1', 10);

    expect(guestRepository.unregisterFcmToken).toHaveBeenCalledWith(GameId.FRULOOP, 'g1');
    expect(guestRepository.markFcmTokenInvalid).toHaveBeenCalledWith('tok');
    expect(guestRepository.findActiveFcmTokenBatch).toHaveBeenCalledWith(GameId.FRULOOP, 'c1', 10);
  });
});
