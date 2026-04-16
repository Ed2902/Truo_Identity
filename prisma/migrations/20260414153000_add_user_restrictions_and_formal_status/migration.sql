CREATE TABLE "UserRestriction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserRestriction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserRestriction_type_check" CHECK ("type" IN ('suspension', 'block')),
  CONSTRAINT "UserRestriction_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE INDEX "UserRestriction_userId_idx" ON "UserRestriction"("userId");
CREATE INDEX "UserRestriction_userId_isActive_idx" ON "UserRestriction"("userId", "isActive");
CREATE INDEX "UserRestriction_isActive_startsAt_endsAt_idx" ON "UserRestriction"("isActive", "startsAt", "endsAt");

ALTER TABLE "UserRestriction"
ADD CONSTRAINT "UserRestriction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_status_check"
CHECK ("status" IN ('active', 'suspended', 'blocked', 'deleted'));
