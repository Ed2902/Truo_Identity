UPDATE "User"
SET "phone" = CONCAT('pending-', REPLACE("id", '-', ''))
WHERE "phone" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "phone" SET NOT NULL;
