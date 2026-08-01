import { NotFoundException } from '@nestjs/common';

import { UnsupportedGameError, validateGameId, type GameId } from '@/common/constants';

/** Map UnsupportedGameError → HTTP 404 at the service/controller boundary. */
export function requireGameId(gameId: string): GameId {
  try {
    return validateGameId(gameId);
  } catch (error) {
    if (error instanceof UnsupportedGameError) {
      throw new NotFoundException(error.message);
    }
    throw error;
  }
}
