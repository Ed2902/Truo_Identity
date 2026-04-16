CREATE TABLE "UserBlock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "blockedUserId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserBlock_userId_blockedUserId_check" CHECK ("userId" <> "blockedUserId")
);

CREATE UNIQUE INDEX "UserBlock_userId_blockedUserId_key"
ON "UserBlock"("userId", "blockedUserId");

CREATE INDEX "UserBlock_userId_idx" ON "UserBlock"("userId");
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_blockedUserId_fkey"
FOREIGN KEY ("blockedUserId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
