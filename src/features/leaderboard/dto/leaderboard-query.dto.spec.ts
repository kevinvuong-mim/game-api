import { GameId } from '@prisma/client';

import { constraintNames, validatePlain } from '@test/dto';
import { LeaderboardQueryDto } from '@/features/leaderboard/dto/leaderboard-query.dto';

describe('LeaderboardQueryDto', () => {
  it('applies default page and limit', async () => {
    const { instance, errors } = await validatePlain(LeaderboardQueryDto, {
      gameId: GameId.FRULOOP,
    });
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(20);
  });

  it('coerces numeric query strings', async () => {
    const { instance, errors } = await validatePlain(LeaderboardQueryDto, {
      gameId: GameId.MEMORA,
      page: '2',
      limit: '50',
      guestId: 'a1b2c3d4-e5f6-4789-8abc-def123456789',
    });
    expect(errors).toHaveLength(0);
    expect(instance.page).toBe(2);
    expect(instance.limit).toBe(50);
  });

  it('rejects invalid game, guest, page, or limit', async () => {
    expect(
      constraintNames((await validatePlain(LeaderboardQueryDto, { gameId: 'NOPE' })).errors),
    ).toContain('isEnum');
    expect(
      constraintNames(
        (
          await validatePlain(LeaderboardQueryDto, {
            gameId: GameId.FRULOOP,
            guestId: 'not-a-uuid',
          })
        ).errors,
      ),
    ).toContain('isUuid');
    expect(
      constraintNames(
        (await validatePlain(LeaderboardQueryDto, { gameId: GameId.FRULOOP, page: 0 })).errors,
      ),
    ).toContain('min');
    expect(
      constraintNames(
        (await validatePlain(LeaderboardQueryDto, { gameId: GameId.FRULOOP, limit: 101 })).errors,
      ),
    ).toContain('max');
  });
});
