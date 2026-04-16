CREATE TABLE "UserIdentityProvider" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "providerEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserIdentityProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserIdentityProvider_provider_check" CHECK ("provider" IN ('google', 'facebook'))
);

CREATE UNIQUE INDEX "UserIdentityProvider_provider_providerUserId_key"
ON "UserIdentityProvider"("provider", "providerUserId");

CREATE UNIQUE INDEX "UserIdentityProvider_userId_provider_key"
ON "UserIdentityProvider"("userId", "provider");

CREATE INDEX "UserIdentityProvider_userId_idx"
ON "UserIdentityProvider"("userId");

CREATE INDEX "UserIdentityProvider_provider_idx"
ON "UserIdentityProvider"("provider");

ALTER TABLE "UserIdentityProvider"
ADD CONSTRAINT "UserIdentityProvider_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
