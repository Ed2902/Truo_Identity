UPDATE "UserProfile"
SET "firstName" = ''
WHERE "firstName" IS NULL;

ALTER TABLE "UserProfile"
ALTER COLUMN "firstName" SET NOT NULL;
