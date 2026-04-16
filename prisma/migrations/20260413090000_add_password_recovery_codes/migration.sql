CREATE TABLE "PasswordRecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordRecoveryCode_userId_idx" ON "PasswordRecoveryCode"("userId");
CREATE INDEX "PasswordRecoveryCode_email_idx" ON "PasswordRecoveryCode"("email");
CREATE INDEX "PasswordRecoveryCode_expiresAt_idx" ON "PasswordRecoveryCode"("expiresAt");
CREATE INDEX "PasswordRecoveryCode_usedAt_idx" ON "PasswordRecoveryCode"("usedAt");

ALTER TABLE "PasswordRecoveryCode"
ADD CONSTRAINT "PasswordRecoveryCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
