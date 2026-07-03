import { GameId, getGameConfig } from '@/common/constants';
import { isValidSha256Hex } from '@/common/utils/crypto.util';

export function validateGameSecrets(): void {
  for (const gameId of Object.values(GameId)) {
    const config = getGameConfig(gameId);

    if (!config.replaySecret) {
      throw new Error(`[StartupGuard] Missing replaySecret for game: ${gameId}`);
    }

    if (!isValidSha256Hex(config.replaySecret)) {
      throw new Error(
        `[StartupGuard] Invalid replaySecret for game: ${gameId}. Must be 64-char hex string.`,
      );
    }
  }
}

export function buildReplayPayload(params: {
  gameId: GameId;
  guestId: string;
  clientResultId: string;
  score: number;
  playedAt?: string;
}): string {
  return `${params.gameId}|${params.guestId}|${params.clientResultId}|${params.score}|${params.playedAt ?? ''}`;
}
