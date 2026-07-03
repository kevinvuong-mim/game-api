import { IsArray, ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { SubmitResultDto } from './submit-result.dto';

export class SubmitResultBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SubmitResultDto)
  items!: SubmitResultDto[];
}
