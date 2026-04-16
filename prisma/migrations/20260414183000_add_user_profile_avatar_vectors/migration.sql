ALTER TABLE "UserProfile"
ADD COLUMN "avatarVectorEmbedding" TEXT,
ADD COLUMN "avatarVectorUpdatedAt" TIMESTAMP(3),
ADD COLUMN "avatarVerifiedAt" TIMESTAMP(3),
ADD COLUMN "lastAvatarValidationScore" DOUBLE PRECISION,
ADD COLUMN "lastAvatarValidationAt" TIMESTAMP(3);
