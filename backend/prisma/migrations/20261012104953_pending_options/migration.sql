-- CreateEnum
CREATE TYPE "PendingOptionStatus" AS ENUM ('PENDING', 'EXECUTED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "PendingOption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "direction" "OptionDirection" NOT NULL,
    "stake" DECIMAL(18,2) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "targetPrice" DECIMAL(18,6) NOT NULL,
    "triggerAbove" BOOLEAN NOT NULL,
    "status" "PendingOptionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "optionId" TEXT,
    "reason" TEXT,

    CONSTRAINT "PendingOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingOption_optionId_key" ON "PendingOption"("optionId");

-- CreateIndex
CREATE INDEX "PendingOption_userId_idx" ON "PendingOption"("userId");

-- CreateIndex
CREATE INDEX "PendingOption_accountId_idx" ON "PendingOption"("accountId");

-- CreateIndex
CREATE INDEX "PendingOption_status_validUntil_idx" ON "PendingOption"("status", "validUntil");

-- AddForeignKey
ALTER TABLE "PendingOption" ADD CONSTRAINT "PendingOption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingOption" ADD CONSTRAINT "PendingOption_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
