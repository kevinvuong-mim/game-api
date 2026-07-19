import {
  Max,
  Min,
  IsInt,
  Matches,
  IsString,
  MaxLength,
  IsISO8601,
  IsOptional,
} from 'class-validator';

import { IsValidMetadata } from '@/common/validators';

/** Prisma `Int` / PostgreSQL `integer` upper bound. */
const MAX_RESULT_SCORE = 2_147_483_647;

export class SubmitResultDto {
  @IsString()
  @MaxLength(128)
  clientResultId!: string;

  @Min(0)
  @Max(MAX_RESULT_SCORE)
  @IsInt()
  score!: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  playedAt?: string;

  @IsOptional()
  @IsValidMetadata()
  metadata?: Record<string, string | number | boolean | null>;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/i)
  signature!: string;
}
