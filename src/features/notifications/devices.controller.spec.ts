import { GameId, NotificationLocale } from '@prisma/client';

import { DevicesController } from '@/features/notifications/devices.controller';
import { DeviceTokenService } from '@/features/notifications/device-token.service';

const guest = { guestId: 'g1', gameId: GameId.FRULOOP };

describe('DevicesController', () => {
  const deviceTokenService = {
    registerDevice: jest.fn(),
    updateDevice: jest.fn(),
    unregisterDevice: jest.fn(),
  };
  const controller = new DevicesController(deviceTokenService as unknown as DeviceTokenService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers, updates, and unregisters devices', async () => {
    const registerDto = { token: 't', platform: 'IOS', locale: NotificationLocale.EN } as never;
    const updateDto = { token: 'n', locale: NotificationLocale.VI };

    deviceTokenService.registerDevice.mockResolvedValue({ guestId: 'g1' });
    deviceTokenService.updateDevice.mockResolvedValue({ guestId: 'g1' });
    deviceTokenService.unregisterDevice.mockResolvedValue({ success: true });

    await expect(controller.registerDevice(registerDto, guest)).resolves.toEqual({ guestId: 'g1' });
    await expect(controller.updateDevice(updateDto, guest)).resolves.toEqual({ guestId: 'g1' });
    await expect(controller.unregisterDevice(guest)).resolves.toEqual({ success: true });
  });
});
