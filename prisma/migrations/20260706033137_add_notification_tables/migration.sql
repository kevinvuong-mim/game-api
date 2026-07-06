-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "DeviceTokenStatus" AS ENUM ('ACTIVE', 'INVALID', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NotificationLocale" AS ENUM ('EN', 'VI');

-- CreateTable
CREATE TABLE "guest_device_tokens" (
    "id" TEXT NOT NULL,
    "gameId" "GameId" NOT NULL,
    "guestId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "locale" "NotificationLocale" NOT NULL DEFAULT 'EN',
    "status" "DeviceTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_notification_states" (
    "gameId" "GameId" NOT NULL,
    "guestId" TEXT NOT NULL,
    "inTop100" BOOLEAN NOT NULL DEFAULT false,
    "lastRank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_notification_states_pkey" PRIMARY KEY ("gameId","guestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_device_tokens_token_key" ON "guest_device_tokens"("token");

-- CreateIndex
CREATE INDEX "guest_device_tokens_gameId_status_idx" ON "guest_device_tokens"("gameId", "status");

-- CreateIndex
CREATE INDEX "guest_device_tokens_status_lastSeenAt_idx" ON "guest_device_tokens"("status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "guest_device_tokens_gameId_guestId_key" ON "guest_device_tokens"("gameId", "guestId");

-- AddForeignKey
ALTER TABLE "guest_device_tokens" ADD CONSTRAINT "guest_device_tokens_gameId_guestId_fkey" FOREIGN KEY ("gameId", "guestId") REFERENCES "guest_players"("gameId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_notification_states" ADD CONSTRAINT "guest_notification_states_gameId_guestId_fkey" FOREIGN KEY ("gameId", "guestId") REFERENCES "guest_players"("gameId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
