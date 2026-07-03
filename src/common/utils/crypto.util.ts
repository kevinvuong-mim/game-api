import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

export function computeReplaySignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function isValidSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function verifyReplaySignature(secret: string, payload: string, received: string): boolean {
  const expected = computeReplaySignature(secret, payload);

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

export function dedupLockKey(gameId: string, guestId: string, clientResultId: string): bigint {
  const hash = createHash('sha256').update(`${gameId}|${guestId}|${clientResultId}`).digest();

  return hash.readBigInt64BE(0);
}
