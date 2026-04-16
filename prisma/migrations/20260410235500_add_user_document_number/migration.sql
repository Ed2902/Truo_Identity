ALTER TABLE "User"
ADD COLUMN "documentNumber" TEXT;

CREATE UNIQUE INDEX "User_documentNumber_key" ON "User"("documentNumber");
