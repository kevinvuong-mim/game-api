import { IsEnum, IsString, MaxLength, IsNotEmpty } from 'class-validator';

import { DevicePlatform, NotificationLocale } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsEnum(NotificationLocale)
  locale!: NotificationLocale;
}
