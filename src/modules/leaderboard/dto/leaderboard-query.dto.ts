import { Type } from 'class-transformer';
import { Max, Min, IsInt, IsString, IsOptional, IsUUID } from 'class-validator';

import { GameId } from '@/common/constants';

export class LeaderboardQueryDto {
  @IsString()
  gameId!: GameId;

  @IsOptional()
  @IsUUID()
  guestId?: string;

  @Min(1)
  @IsInt()
  @Type(() => Number)
  page: number = 1;

  @Min(1)
  @IsInt()
  @Max(100)
  @Type(() => Number)
  limit: number = 20;
}
