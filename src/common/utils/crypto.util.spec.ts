import { createHash } from 'node:crypto';

import {
  dedupLockKey,
  generateSecretToken,
  hashSecretToken,
  leaderboardLockKey,
} from '@/common/utils/crypto.util';

describe('crypto.util', () => {
  describe('generateSecretToken', () => {
    it('returns a unique base64url token', () => {
      const token = generateSecretToken();

      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Buffer.from(token, 'base64url').length).toBe(32);
      expect(generateSecretToken()).not.toBe(token);
    });
  });

  describe('hashSecretToken', () => {
    it('returns a stable SHA-256 hex digest', () => {
      const token = 'guest-secret';

      expect(hashSecretToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
      expect(hashSecretToken(token)).toBe(hashSecretToken(token));
      expect(hashSecretToken('other')).not.toBe(hashSecretToken(token));
    });
  });

  describe('dedupLockKey', () => {
    it('returns a bigint derived from the first 8 bytes of the SHA-256 digest', () => {
      const gameId = 'FRULOOP';
      const guestId = 'guest-1';
      const clientResultId = 'result-1';
      const expected = createHash('sha256')
        .update(`${gameId}|${guestId}|${clientResultId}`)
        .digest()
        .readBigInt64BE(0);

      expect(dedupLockKey(gameId, guestId, clientResultId)).toBe(expected);
    });

    it('changes when any component changes', () => {
      const base = dedupLockKey('FRULOOP', 'g1', 'r1');

      expect(dedupLockKey('MEMORA', 'g1', 'r1')).not.toBe(base);
      expect(dedupLockKey('FRULOOP', 'g2', 'r1')).not.toBe(base);
      expect(dedupLockKey('FRULOOP', 'g1', 'r2')).not.toBe(base);
    });
  });

  describe('leaderboardLockKey', () => {
    it('returns a bigint unique per game', () => {
      const expected = createHash('sha256')
        .update('leaderboard|FRULOOP')
        .digest()
        .readBigInt64BE(0);

      expect(leaderboardLockKey('FRULOOP')).toBe(expected);
      expect(leaderboardLockKey('MEMORA')).not.toBe(leaderboardLockKey('FRULOOP'));
    });
  });
});
