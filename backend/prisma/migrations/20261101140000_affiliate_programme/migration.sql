-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AffiliateModel" AS ENUM ('REVSHARE', 'TURNOVER', 'CPA');

-- DropIndex
DROP INDEX "User_referralCode_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "referralCode",
DROP COLUMN "referredAt",
DROP COLUMN "referredById",
ADD COLUMN     "country" TEXT;

-- DropTable
DROP TABLE "ReferralEarning";

-- DropTable
DROP TABLE "ReferralPayout";

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "trafficSources" TEXT NOT NULL,
    "payoutMethod" TEXT,
    "payoutDetails" JSONB,
    "parentId" TEXT,
    "subCode" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "telegramCode" TEXT,
    "note" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" "AffiliateModel" NOT NULL,
    "subId" TEXT,
    "landing" TEXT NOT NULL DEFAULT '/',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "subId" TEXT,
    "clickId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePromoCode" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "model" "AffiliateModel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "linkId" TEXT,
    "promoCodeId" TEXT,
    "model" "AffiliateModel" NOT NULL,
    "level" INTEGER NOT NULL,
    "sharePct" DECIMAL(6,2) NOT NULL,
    "subId" TEXT,
    "clickId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "flags" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ftdAt" TIMESTAMP(3),
    "ftdAmount" DECIMAL(18,2),
    "depositTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "activeTraderAt" TIMESTAMP(3),
    "cpaAt" TIMESTAMP(3),
    "turnoverCommission" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLedger" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCRUED',
    "uniqueKey" TEXT NOT NULL,
    "referralId" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "details" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePostback" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePostback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePostbackLog" (
    "id" TEXT NOT NULL,
    "postbackId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePostbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateTicket" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_subCode_key" ON "Affiliate"("subCode");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_telegramCode_key" ON "Affiliate"("telegramCode");

-- CreateIndex
CREATE INDEX "Affiliate_parentId_idx" ON "Affiliate"("parentId");

-- CreateIndex
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_idx" ON "AffiliateLink"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateClick_linkId_createdAt_idx" ON "AffiliateClick"("linkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePromoCode_code_key" ON "AffiliatePromoCode"("code");

-- CreateIndex
CREATE INDEX "AffiliatePromoCode_affiliateId_idx" ON "AffiliatePromoCode"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReferral_userId_key" ON "AffiliateReferral"("userId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_affiliateId_registeredAt_idx" ON "AffiliateReferral"("affiliateId", "registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLedger_uniqueKey_key" ON "AffiliateLedger"("uniqueKey");

-- CreateIndex
CREATE INDEX "AffiliateLedger_affiliateId_status_createdAt_idx" ON "AffiliateLedger"("affiliateId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateLedger_referralId_idx" ON "AffiliateLedger"("referralId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_idx" ON "AffiliatePayout"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_status_idx" ON "AffiliatePayout"("status");

-- CreateIndex
CREATE INDEX "AffiliatePostback_affiliateId_idx" ON "AffiliatePostback"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliatePostbackLog_postbackId_createdAt_idx" ON "AffiliatePostbackLog"("postbackId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateTicket_affiliateId_idx" ON "AffiliateTicket"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateTicketMessage_ticketId_idx" ON "AffiliateTicketMessage"("ticketId");

