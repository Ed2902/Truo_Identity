CREATE TABLE "UserPremium" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipType" TEXT NOT NULL DEFAULT 'premium',
  "billingCycle" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPremium_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserPremium_membershipType_check" CHECK ("membershipType" IN ('premium')),
  CONSTRAINT "UserPremium_billingCycle_check" CHECK ("billingCycle" IN ('monthly', 'semiannual', 'annual')),
  CONSTRAINT "UserPremium_status_check" CHECK ("status" IN ('active', 'expired', 'cancelled')),
  CONSTRAINT "UserPremium_source_check" CHECK ("source" IS NULL OR "source" IN ('manual', 'payment', 'promo', 'trial')),
  CONSTRAINT "UserPremium_dates_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "UserPremium_userId_idx" ON "UserPremium"("userId");
CREATE INDEX "UserPremium_userId_status_idx" ON "UserPremium"("userId", "status");
CREATE INDEX "UserPremium_status_endsAt_idx" ON "UserPremium"("status", "endsAt");
CREATE INDEX "UserPremium_createdAt_idx" ON "UserPremium"("createdAt");

CREATE UNIQUE INDEX "UserPremium_single_active_membership_per_user_idx"
ON "UserPremium"("userId")
WHERE "status" = 'active';

ALTER TABLE "UserPremium"
ADD CONSTRAINT "UserPremium_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
