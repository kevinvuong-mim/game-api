import { IsBoolean } from 'class-validator';

export class DeviceNotificationPreferenceDto {
  @IsBoolean()
  enabled!: boolean;
}
