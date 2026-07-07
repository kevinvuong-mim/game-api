import { Type } from 'class-transformer';
import { IsEnum, IsArray, ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';

import { GameId } from '@/common/constants';
import { SubmitResultDto } from './submit-result.dto';

export class SubmitResultBatchDto {
  @IsEnum(GameId)
  gameId!: GameId;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SubmitResultDto)
  items!: SubmitResultDto[];
}
