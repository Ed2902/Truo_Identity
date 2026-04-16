ALTER TABLE "UserProfile"
ADD COLUMN "timeZone" TEXT;

ALTER TABLE "UserPremium"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "UserPremium_userId_idempotencyKey_key"
ON "UserPremium"("userId", "idempotencyKey");
