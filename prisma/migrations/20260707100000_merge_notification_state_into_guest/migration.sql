-- Move top-100 notification tracking onto guest_players and drop guest_notification_states.

ALTER TABLE "guest_players" ADD COLUMN "inTop100" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guest_players" ADD COLUMN "lastRank" INTEGER;

UPDATE "guest_players" AS gp
SET
  "inTop100" = gns."inTop100",
  "lastRank" = gns."lastRank"
FROM "guest_notification_states" AS gns
WHERE gp."gameId" = gns."gameId" AND gp."id" = gns."guestId";

DROP TABLE "guest_notification_states";
