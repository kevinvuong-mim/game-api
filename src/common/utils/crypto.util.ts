import { createHash, randomBytes } from 'node:crypto';

export function generateSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function dedupLockKey(gameId: string, guestId: string, clientResultId: string): bigint {
  const hash = createHash('sha256').update(`${gameId}|${guestId}|${clientResultId}`).digest();

  return hash.readBigInt64BE(0);
}

/** Serializes Top-100 displacement reads + score upserts for one game. */
export function leaderboardLockKey(gameId: string): bigint {
  const hash = createHash('sha256').update(`leaderboard|${gameId}`).digest();

  return hash.readBigInt64BE(0);
}
