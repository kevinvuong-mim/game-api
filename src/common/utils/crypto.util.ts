import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Comma-separated `API_KEY` values so a leaked key can be rotated without downtime. */
export function parseConfiguredSecrets(configured: string): string[] {
  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function matchesConfiguredSecret(provided: string, configured: string): boolean {
  const secrets = parseConfiguredSecrets(configured);
  let matched = false;

  for (const secret of secrets) {
    if (timingSafeEqualString(provided, secret)) {
      matched = true;
    }
  }

  return matched;
}
