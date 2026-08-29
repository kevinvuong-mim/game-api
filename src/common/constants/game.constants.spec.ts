import { GameId } from '@prisma/client';

import { GAME_CONFIG, getGamesWithRankPushCron } from '@/common/constants/game.constants';

describe('game.constants', () => {
  it('declares rank-push cron for every supported game', () => {
    expect(Object.keys(GAME_CONFIG).sort()).toEqual([GameId.FRULOOP, GameId.MEMORA].sort());
    expect(GAME_CONFIG[GameId.FRULOOP].rankPushCron).toBe('0 9 * * 6');
    expect(GAME_CONFIG[GameId.MEMORA].rankPushCron).toBe('0 9 * * 6');
  });

  it('getGamesWithRankPushCron returns games that have a cron expression', () => {
    expect(getGamesWithRankPushCron().sort()).toEqual([GameId.FRULOOP, GameId.MEMORA].sort());
  });
});
