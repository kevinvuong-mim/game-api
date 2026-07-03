import { NotFoundException } from '@nestjs/common';

export enum GameId {
  FRULOOP = 'FRULOOP',
}

export const GAME_CONFIG: Record<GameId, { name: string; replaySecret: string }> = {
  [GameId.FRULOOP]: {
    name: 'Fruloop',
    replaySecret: process.env.REPLAY_SECRET_FRULOOP ?? '',
  },
} as const;

export function validateGameId(gameId: string): GameId {
  if (!Object.values(GameId).includes(gameId as GameId)) {
    throw new NotFoundException(`Game "${gameId}" not supported`);
  }

  return gameId as GameId;
}

export function getGameConfig(gameId: GameId) {
  const config = GAME_CONFIG[gameId];
  const envKey = `REPLAY_SECRET_${gameId}`;

  return {
    name: config.name,
    replaySecret: process.env[envKey] ?? config.replaySecret,
  };
}
