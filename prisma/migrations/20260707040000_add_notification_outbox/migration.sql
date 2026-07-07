-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('DEAD', 'SENT', 'PENDING', 'SKIPPED', 'PROCESSING');

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "gameId" "GameId" NOT NULL,
    "guestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "params" JSONB,
    "locale" "NotificationLocale",
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_idempotencyKey_key" ON "notification_outbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "notification_outbox_status_scheduledAt_idx" ON "notification_outbox"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notification_outbox_gameId_guestId_createdAt_idx" ON "notification_outbox"("gameId", "guestId", "createdAt");
