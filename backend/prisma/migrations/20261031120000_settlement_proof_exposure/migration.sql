-- AlterTable: settlement proof
ALTER TABLE "BinaryOption" ADD COLUMN "closeQuoteAt" TIMESTAMP(3),
ADD COLUMN "settleSource" TEXT;

-- AlterTable: per-asset exposure limit (0 = no limit)
ALTER TABLE "RiskRule" ADD COLUMN "maxAssetExposure" DECIMAL(18,2) NOT NULL DEFAULT 0;
