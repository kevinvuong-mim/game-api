-- Convert game_results into a range-partitioned table by createdAt.
-- Prisma doesn't support declarative partitioning, so this migration is pure SQL.

-- 1) Rename old constraints/indexes first to avoid name collisions
-- when creating the new parent table with the same canonical names.
ALTER TABLE "game_results" RENAME CONSTRAINT "game_results_pkey" TO "game_results_old_pkey";
ALTER TABLE "game_results" RENAME CONSTRAINT "game_results_gameId_guestId_fkey" TO "game_results_old_gameId_guestId_fkey";
ALTER INDEX "game_results_gameId_guestId_idx" RENAME TO "game_results_old_gameId_guestId_idx";
ALTER INDEX "game_results_gameId_createdAt_idx" RENAME TO "game_results_old_gameId_createdAt_idx";
ALTER INDEX "game_results_gameId_guestId_clientResultId_idx" RENAME TO "game_results_old_gameId_guestId_clientResultId_idx";

-- 2) Move old table out of the way.
ALTER TABLE "game_results" RENAME TO "game_results_old";

-- 3) Recreate partitioned parent table.
CREATE TABLE "game_results" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gameId" "GameId" NOT NULL,
  "guestId" TEXT NOT NULL,
  "clientResultId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "replayHash" TEXT NOT NULL,
  "metadata" JSONB,
  "playedAt" TIMESTAMP(3),
  CONSTRAINT "game_results_pkey" PRIMARY KEY ("id", "createdAt"),
  CONSTRAINT "game_results_gameId_guestId_fkey"
    FOREIGN KEY ("gameId", "guestId")
    REFERENCES "guest_players"("gameId", "id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
) PARTITION BY RANGE ("createdAt");

-- 4) Indexes for hot read paths and dedup lookup.
CREATE INDEX "game_results_gameId_guestId_idx" ON "game_results"("gameId", "guestId");
CREATE INDEX "game_results_gameId_createdAt_idx" ON "game_results"("gameId", "createdAt");
CREATE INDEX "game_results_gameId_guestId_clientResultId_idx" ON "game_results"("gameId", "guestId", "clientResultId");

-- 5) Seed first partition.
CREATE TABLE "game_results_2026"
  PARTITION OF "game_results"
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 6) Copy old data into the partitioned table.
INSERT INTO "game_results" (
  "id",
  "createdAt",
  "gameId",
  "guestId",
  "clientResultId",
  "score",
  "replayHash",
  "metadata",
  "playedAt"
)
SELECT
  "id",
  "createdAt",
  "gameId",
  "guestId",
  "clientResultId",
  "score",
  "replayHash",
  "metadata",
  "playedAt"
FROM "game_results_old";

-- 7) Drop old table.
DROP TABLE "game_results_old";
