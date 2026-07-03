import { Min, IsInt, IsString, IsISO8601, IsOptional } from 'class-validator';

import { IsValidMetadata } from '@/common/validators';

export class SubmitResultDto {
  @IsString()
  clientResultId!: string;

  @Min(0)
  @IsInt()
  score!: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  playedAt?: string;

  @IsOptional()
  @IsValidMetadata()
  metadata?: Record<string, string | number | boolean | null>;

  @IsString()
  signature!: string;
}
