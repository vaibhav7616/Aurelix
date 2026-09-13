-- CreateEnum
CREATE TYPE "OptionDirection" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "OptionStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'TIE');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "payoutPct" INTEGER NOT NULL DEFAULT 80;

-- CreateTable
CREATE TABLE "BinaryOption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "direction" "OptionDirection" NOT NULL,
    "stake" DECIMAL(18,2) NOT NULL,
    "payoutPct" INTEGER NOT NULL,
    "entryPrice" DECIMAL(18,6) NOT NULL,
    "closePrice" DECIMAL(18,6),
    "profit" DECIMAL(18,2),
    "durationSec" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "status" "OptionStatus" NOT NULL DEFAULT 'OPEN',
    "idempotencyKey" TEXT,

    CONSTRAINT "BinaryOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BinaryOption_idempotencyKey_key" ON "BinaryOption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BinaryOption_userId_idx" ON "BinaryOption"("userId");

-- CreateIndex
CREATE INDEX "BinaryOption_accountId_idx" ON "BinaryOption"("accountId");

-- CreateIndex
CREATE INDEX "BinaryOption_status_expiresAt_idx" ON "BinaryOption"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BinaryOption_openedAt_idx" ON "BinaryOption"("openedAt");

-- AddForeignKey
ALTER TABLE "BinaryOption" ADD CONSTRAINT "BinaryOption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinaryOption" ADD CONSTRAINT "BinaryOption_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

