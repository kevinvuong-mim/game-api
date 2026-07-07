import { IsEnum } from 'class-validator';

import { GameId } from '@/common/constants';

export class InitGuestDto {
  @IsEnum(GameId)
  gameId!: GameId;
}
