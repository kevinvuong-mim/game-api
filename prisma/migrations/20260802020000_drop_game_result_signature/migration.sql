-- Drop HMAC soft-integrity column; score submit trusts authenticated guest + dedup.
ALTER TABLE "game_results" DROP COLUMN IF EXISTS "signature";
