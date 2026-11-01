-- Wallet transaction types for bonuses and referral payouts
ALTER TYPE "TxnType" ADD VALUE IF NOT EXISTS 'BONUS';
ALTER TYPE "TxnType" ADD VALUE IF NOT EXISTS 'REFERRAL';

CREATE TYPE "BonusStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FORFEITED');

-- Referral identity on users (existing users get a code)
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT, ADD COLUMN "referredById" TEXT, ADD COLUMN "referredAt" TIMESTAMP(3);
UPDATE "User" SET "referralCode" = upper(substr(md5(random()::text || "id"), 1, 8)) WHERE "referralCode" IS NULL;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- Promo accepted at deposit creation
ALTER TABLE "Deposit" ADD COLUMN "bonusPct" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "promoCode" TEXT;

CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "depositId" TEXT,
    "code" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "turnoverRequired" DECIMAL(18,2) NOT NULL,
    "turnoverDone" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "BonusStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Bonus_depositId_key" ON "Bonus"("depositId");
CREATE INDEX "Bonus_accountId_status_idx" ON "Bonus"("accountId", "status");
CREATE INDEX "Bonus_userId_idx" ON "Bonus"("userId");

CREATE TABLE "ReferralEarning" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "platformResult" DECIMAL(18,2) NOT NULL,
    "sharePct" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralEarning_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralEarning_optionId_key" ON "ReferralEarning"("optionId");
CREATE INDEX "ReferralEarning_referrerId_payoutId_idx" ON "ReferralEarning"("referrerId", "payoutId");
CREATE INDEX "ReferralEarning_referredId_idx" ON "ReferralEarning"("referredId");

CREATE TABLE "ReferralPayout" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralPayout_referrerId_idx" ON "ReferralPayout"("referrerId");
