import { GameId } from '@prisma/client';

import { constraintNames, validatePlain } from '@test/dto';
import { InitGuestDto } from '@/features/guest/dto/init-guest.dto';
import { UpdateNameDto } from '@/features/guest/dto/update-name.dto';

describe('InitGuestDto', () => {
  it('accepts a supported game id', async () => {
    const { errors } = await validatePlain(InitGuestDto, { gameId: GameId.FRULOOP });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing or unknown game id', async () => {
    expect(constraintNames((await validatePlain(InitGuestDto, {})).errors)).toContain('isEnum');
    expect(
      constraintNames((await validatePlain(InitGuestDto, { gameId: 'UNKNOWN' })).errors),
    ).toContain('isEnum');
  });
});

describe('UpdateNameDto', () => {
  it('trims and accepts a display name', async () => {
    const { instance, errors } = await validatePlain(UpdateNameDto, { name: '  Ada  ' });
    expect(errors).toHaveLength(0);
    expect(instance.name).toBe('Ada');
  });

  it('rejects empty or overly long names', async () => {
    expect(constraintNames((await validatePlain(UpdateNameDto, { name: '' })).errors)).toContain(
      'minLength',
    );
    expect(
      constraintNames((await validatePlain(UpdateNameDto, { name: 'a'.repeat(27) })).errors),
    ).toContain('maxLength');
  });
});
