import { GameId } from '@prisma/client';

export { GameId };

export interface GameConfigEntry {
  replaySecret: string;
  rankPushCron?: string;
}

export const GAME_CONFIG: Record<GameId, GameConfigEntry> = {
  [GameId.FRULOOP]: {
    rankPushCron: '0 9 * * 6',
    replaySecret: 'b1dec842ef5c5b846eaca346669f2d3ccd9a1811e63d43c249402577207c0820',
  },
};

export class UnsupportedGameError extends Error {
  constructor(gameId: string) {
    super(`Game "${gameId}" not supported`);
    this.name = 'UnsupportedGameError';
  }
}

export function getGamesWithRankPushCron(): GameId[] {
  return Object.entries(GAME_CONFIG)
    .filter(([, config]) => config.rankPushCron)
    .map(([gameId]) => gameId as GameId);
}

/** Pure parse — no HTTP coupling. Throws UnsupportedGameError when invalid. */
export function validateGameId(gameId: string): GameId {
  if (!Object.values(GameId).includes(gameId as GameId)) {
    throw new UnsupportedGameError(gameId);
  }

  return gameId as GameId;
}

export function getGameConfig(gameId: GameId) {
  return GAME_CONFIG[gameId];
}
