-- Affiliate tables were created without foreign keys. Remove rows whose owner no longer
-- exists (only possible if a user was hard-deleted) so the constraints can be added.
DELETE FROM "Affiliate" a WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "Affiliate" a SET "parentId" = NULL WHERE "parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Affiliate" p WHERE p.id = a."parentId");
DELETE FROM "AffiliateReferral" r WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = r."userId") OR NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = r."affiliateId");
DELETE FROM "AffiliateLink" l WHERE NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = l."affiliateId");
UPDATE "AffiliateReferral" r SET "linkId" = NULL WHERE "linkId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AffiliateLink" l WHERE l.id = r."linkId");
DELETE FROM "AffiliateClick" c WHERE NOT EXISTS (SELECT 1 FROM "AffiliateLink" l WHERE l.id = c."linkId");
DELETE FROM "AffiliatePromoCode" x WHERE NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = x."affiliateId");
DELETE FROM "AffiliateLedger" x WHERE NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = x."affiliateId");
UPDATE "AffiliateLedger" x SET "referralId" = NULL WHERE "referralId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AffiliateReferral" r WHERE r.id = x."referralId");
DELETE FROM "AffiliatePayout" x WHERE NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = x."affiliateId");
DELETE FROM "AffiliatePostback" x WHERE NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = x."affiliateId");
DELETE FROM "AffiliatePostbackLog" x WHERE NOT EXISTS (SELECT 1 FROM "AffiliatePostback" p WHERE p.id = x."postbackId");
DELETE FROM "AffiliateTicket" x WHERE NOT EXISTS (SELECT 1 FROM "Affiliate" a WHERE a.id = x."affiliateId");
DELETE FROM "AffiliateTicketMessage" x WHERE NOT EXISTS (SELECT 1 FROM "AffiliateTicket" t WHERE t.id = x."ticketId");

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePromoCode" ADD CONSTRAINT "AffiliatePromoCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLedger" ADD CONSTRAINT "AffiliateLedger_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLedger" ADD CONSTRAINT "AffiliateLedger_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "AffiliateReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePostback" ADD CONSTRAINT "AffiliatePostback_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePostbackLog" ADD CONSTRAINT "AffiliatePostbackLog_postbackId_fkey" FOREIGN KEY ("postbackId") REFERENCES "AffiliatePostback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTicket" ADD CONSTRAINT "AffiliateTicket_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTicketMessage" ADD CONSTRAINT "AffiliateTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "AffiliateTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

