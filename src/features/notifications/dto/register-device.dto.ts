import { IsEnum, IsString, IsNotEmpty } from 'class-validator';

import { DevicePlatform, NotificationLocale } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsEnum(NotificationLocale)
  locale!: NotificationLocale;
}
