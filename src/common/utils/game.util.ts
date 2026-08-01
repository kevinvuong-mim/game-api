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

/** Sorted-key JSON so client/server HMAC metadata segments match. */
export function canonicalizeMetadata(
  metadata?: Record<string, string | number | boolean | null>,
): string {
  if (!metadata) {
    return '';
  }

  const keys = Object.keys(metadata).sort();
  if (keys.length === 0) {
    return '';
  }

  const sorted: Record<string, string | number | boolean | null> = {};
  for (const key of keys) {
    sorted[key] = metadata[key];
  }

  return JSON.stringify(sorted);
}

export function buildReplayPayload(params: {
  score: number;
  gameId: GameId;
  guestId: string;
  playedAt?: string;
  clientResultId: string;
  metadata?: Record<string, string | number | boolean | null>;
}): string {
  const metadataPart = canonicalizeMetadata(params.metadata);
  return `${params.gameId}|${params.guestId}|${params.clientResultId}|${params.score}|${params.playedAt ?? ''}|${metadataPart}`;
}
