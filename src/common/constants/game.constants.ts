import { GameId } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

export { GameId };

export const GAME_CONFIG: Record<GameId, { name: string; replaySecret: string }> = {
  [GameId.FRULOOP]: {
    name: 'Fruloop',
    replaySecret: 'b1dec842ef5c5b846eaca346669f2d3ccd9a1811e63d43c249402577207c0820',
  },
};

export function validateGameId(gameId: string): GameId {
  if (!Object.values(GameId).includes(gameId as GameId)) {
    throw new NotFoundException(`Game "${gameId}" not supported`);
  }

  return gameId as GameId;
}

export function getGameConfig(gameId: GameId) {
  return GAME_CONFIG[gameId];
}
