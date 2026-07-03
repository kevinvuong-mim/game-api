-- CreateEnum
CREATE TYPE "GameId" AS ENUM ('FRULOOP');

-- CreateTable
CREATE TABLE "guest_players" (
    "id" TEXT NOT NULL,
    "gameId" "GameId" NOT NULL,
    "name" TEXT,
    "secretTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "game_results_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateTable
CREATE TABLE "leaderboards" (
    "gameId" "GameId" NOT NULL,
    "guestId" TEXT NOT NULL,
    "bestScore" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("gameId","guestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_players_gameId_id_key" ON "guest_players"("gameId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_players_secretTokenHash_key" ON "guest_players"("secretTokenHash");

-- CreateIndex
CREATE INDEX "game_results_gameId_guestId_clientResultId_idx" ON "game_results"("gameId", "guestId", "clientResultId");

-- CreateIndex
CREATE INDEX "game_results_gameId_guestId_idx" ON "game_results"("gameId", "guestId");

-- CreateIndex
CREATE INDEX "game_results_gameId_createdAt_idx" ON "game_results"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "leaderboards_gameId_bestScore_idx" ON "leaderboards"("gameId", "bestScore" DESC);

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_gameId_guestId_fkey" FOREIGN KEY ("gameId", "guestId") REFERENCES "guest_players"("gameId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_gameId_guestId_fkey" FOREIGN KEY ("gameId", "guestId") REFERENCES "guest_players"("gameId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
