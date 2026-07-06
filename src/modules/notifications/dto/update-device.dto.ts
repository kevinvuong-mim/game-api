import { IsEnum, IsString, IsNotEmpty } from 'class-validator';

import { NotificationLocale } from '@prisma/client';

export class UpdateDeviceDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsEnum(NotificationLocale)
  locale!: NotificationLocale;
}
