ALTER TABLE "UserProfile"
ADD COLUMN "avatarStorageKey" TEXT;

UPDATE "UserProfile"
SET "avatarStorageKey" = regexp_replace(
  "avatarUrl",
  '^https?://[^/]+/[^/]+/',
  ''
)
WHERE "avatarUrl" IS NOT NULL
  AND "avatarStorageKey" IS NULL
  AND "avatarUrl" ~ '^https?://[^/]+/[^/]+/.+';
