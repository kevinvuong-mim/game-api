import { DevicePlatform, NotificationLocale } from '@prisma/client';

import { constraintNames, validatePlain } from '@test/dto';
import { UpdateDeviceDto } from '@/features/notifications/dto/update-device.dto';
import { RegisterDeviceDto } from '@/features/notifications/dto/register-device.dto';

describe('RegisterDeviceDto', () => {
  const valid = {
    token: 'fcm-token',
    platform: DevicePlatform.IOS,
    locale: NotificationLocale.EN,
  };

  it('accepts a valid registration payload', async () => {
    expect((await validatePlain(RegisterDeviceDto, valid)).errors).toHaveLength(0);
  });

  it('rejects empty tokens and invalid enums', async () => {
    expect(
      constraintNames((await validatePlain(RegisterDeviceDto, { ...valid, token: '' })).errors),
    ).toContain('isNotEmpty');
    expect(
      constraintNames(
        (await validatePlain(RegisterDeviceDto, { ...valid, platform: 'WEB' })).errors,
      ),
    ).toContain('isEnum');
  });
});

describe('UpdateDeviceDto', () => {
  it('accepts token and locale', async () => {
    expect(
      (await validatePlain(UpdateDeviceDto, { token: 't', locale: NotificationLocale.VI })).errors,
    ).toHaveLength(0);
  });

  it('rejects an oversized token', async () => {
    expect(
      constraintNames(
        (
          await validatePlain(UpdateDeviceDto, {
            token: 't'.repeat(4097),
            locale: NotificationLocale.EN,
          })
        ).errors,
      ),
    ).toContain('maxLength');
  });
});
