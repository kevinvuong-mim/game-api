import { GameId } from '@prisma/client';

export { GameId };

export interface GameConfigEntry {
  rankPushCron?: string;
}

export const GAME_CONFIG: Record<GameId, GameConfigEntry> = {
  [GameId.FRULOOP]: {
    rankPushCron: '0 9 * * 6',
  },
  [GameId.MEMORA]: {
    rankPushCron: '0 9 * * 6',
  },
};

export function getGamesWithRankPushCron(): GameId[] {
  return Object.entries(GAME_CONFIG)
    .filter(([, config]) => config.rankPushCron)
    .map(([gameId]) => gameId as GameId);
}

export function getGameConfig(gameId: GameId) {
  return GAME_CONFIG[gameId];
}
