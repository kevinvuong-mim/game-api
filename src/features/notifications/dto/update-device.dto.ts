import { IsEnum, IsString, MaxLength, IsNotEmpty } from 'class-validator';

import { NotificationLocale } from '@prisma/client';

export class UpdateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsEnum(NotificationLocale)
  locale!: NotificationLocale;
}
