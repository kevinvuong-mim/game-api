import { GameId } from '@prisma/client';

import { constraintNames, validatePlain } from '@test/dto';
import { SubmitResultDto } from '@/features/results/dto/submit-result.dto';
import { SubmitResultBatchDto } from '@/features/results/dto/submit-result-batch.dto';

describe('SubmitResultDto', () => {
  const valid = {
    clientResultId: 'result-1',
    score: 12,
  };

  it('accepts a minimal valid result', async () => {
    const { errors } = await validatePlain(SubmitResultDto, valid);
    expect(errors).toHaveLength(0);
  });

  it('trims clientResultId and accepts optional playedAt and metadata', async () => {
    const { instance, errors } = await validatePlain(SubmitResultDto, {
      ...valid,
      clientResultId: '  abc  ',
      playedAt: '2026-08-18T00:00:00.000Z',
      metadata: { combo: 3 },
    });
    expect(errors).toHaveLength(0);
    expect(instance.clientResultId).toBe('abc');
  });

  it('rejects a negative score and an oversized score', async () => {
    expect(
      constraintNames((await validatePlain(SubmitResultDto, { ...valid, score: -1 })).errors),
    ).toContain('min');
    expect(
      constraintNames(
        (await validatePlain(SubmitResultDto, { ...valid, score: 2_147_483_648 })).errors,
      ),
    ).toContain('max');
  });

  it('rejects an empty clientResultId', async () => {
    expect(
      constraintNames(
        (await validatePlain(SubmitResultDto, { ...valid, clientResultId: '' })).errors,
      ),
    ).toContain('isNotEmpty');
  });
});

describe('SubmitResultBatchDto', () => {
  it('accepts a batch of 1–50 items', async () => {
    const { errors } = await validatePlain(SubmitResultBatchDto, {
      gameId: GameId.MEMORA,
      items: [{ clientResultId: 'r1', score: 1 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty or oversized batch', async () => {
    expect(
      constraintNames(
        (await validatePlain(SubmitResultBatchDto, { gameId: GameId.FRULOOP, items: [] })).errors,
      ),
    ).toContain('arrayMinSize');

    const items = Array.from({ length: 51 }, (_, i) => ({
      clientResultId: `r${i}`,
      score: i,
    }));
    expect(
      constraintNames(
        (await validatePlain(SubmitResultBatchDto, { gameId: GameId.FRULOOP, items })).errors,
      ),
    ).toContain('arrayMaxSize');
  });
});
