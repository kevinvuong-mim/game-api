import { GameId, NotificationLocale } from '@prisma/client';

import type { FcmService } from '@/features/notifications/fcm.service';
import { NOTIFICATION_ROUTES, NOTIFICATION_TYPES } from '@/common/constants';
import type { DeviceTokenService } from '@/features/notifications/device-token.service';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

describe('NotificationDeliveryService', () => {
  const fcmService = { isEnabled: jest.fn(), sendToToken: jest.fn() };
  const deviceTokenService = { getActiveToken: jest.fn(), markTokenInvalid: jest.fn() };
  let service: NotificationDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationDeliveryService(
      fcmService as unknown as FcmService,
      deviceTokenService as unknown as DeviceTokenService,
    );
  });

  it('returns false when Firebase is disabled', async () => {
    fcmService.isEnabled.mockReturnValue(false);

    await expect(service.sendTop100Exited(GameId.FRULOOP, 'g1', 101)).resolves.toBe(false);
    expect(deviceTokenService.getActiveToken).not.toHaveBeenCalled();
  });

  it('returns false when the guest has no active token', async () => {
    fcmService.isEnabled.mockReturnValue(true);
    deviceTokenService.getActiveToken.mockResolvedValue(null);

    await expect(service.sendRankPush(GameId.FRULOOP, 'g1', 3)).resolves.toBe(false);
  });

  it('sends with the device locale when no override is provided', async () => {
    fcmService.isEnabled.mockReturnValue(true);
    deviceTokenService.getActiveToken.mockResolvedValue({
      fcmToken: 'tok',
      notificationLocale: NotificationLocale.VI,
    });
    fcmService.sendToToken.mockResolvedValue({ success: true });

    await expect(service.sendTop100Exited(GameId.MEMORA, 'g1', 101)).resolves.toBe(true);
    expect(fcmService.sendToToken).toHaveBeenCalledWith('tok', {
      type: NOTIFICATION_TYPES.TOP_100_EXITED,
      locale: 'vi',
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      params: { rank: 101 },
    });
  });

  it('prefers an explicit locale override', async () => {
    fcmService.isEnabled.mockReturnValue(true);
    deviceTokenService.getActiveToken.mockResolvedValue({
      fcmToken: 'tok',
      notificationLocale: NotificationLocale.EN,
    });
    fcmService.sendToToken.mockResolvedValue({ success: true });

    await service.sendRankPush(GameId.FRULOOP, 'g1', 4, 'vi-VN');
    expect(fcmService.sendToToken).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ locale: 'vi', type: NOTIFICATION_TYPES.RANK_PUSH }),
    );
  });

  it('skips the token lookup when an FCM token is already provided', async () => {
    fcmService.isEnabled.mockReturnValue(true);
    fcmService.sendToToken.mockResolvedValue({ success: true });

    await expect(service.sendRankPush(GameId.FRULOOP, 'g1', 4, 'en', 'known-tok')).resolves.toBe(
      true,
    );
    expect(deviceTokenService.getActiveToken).not.toHaveBeenCalled();
    expect(fcmService.sendToToken).toHaveBeenCalledWith(
      'known-tok',
      expect.objectContaining({ locale: 'en' }),
    );
  });

  it('marks invalid tokens and returns false', async () => {
    fcmService.isEnabled.mockReturnValue(true);
    deviceTokenService.getActiveToken.mockResolvedValue({ fcmToken: 'tok' });
    fcmService.sendToToken.mockResolvedValue({ success: false, invalidToken: true });

    await expect(
      service.deliver({
        gameId: GameId.FRULOOP,
        guestId: 'g1',
        route: NOTIFICATION_ROUTES.LEADERBOARD,
        type: NOTIFICATION_TYPES.RANK_PUSH,
      }),
    ).resolves.toBe(false);
    expect(deviceTokenService.markTokenInvalid).toHaveBeenCalledWith('tok');
  });

  it('swallows unexpected delivery errors', async () => {
    fcmService.isEnabled.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(
      service.deliver({
        gameId: GameId.FRULOOP,
        guestId: 'g1',
        route: NOTIFICATION_ROUTES.LEADERBOARD,
        type: NOTIFICATION_TYPES.RANK_PUSH,
      }),
    ).resolves.toBe(false);
  });
});
