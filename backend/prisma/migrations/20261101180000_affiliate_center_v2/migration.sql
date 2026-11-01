-- AlterTable
ALTER TABLE "AffiliateClick" ADD COLUMN     "country" TEXT;

-- AlterTable
ALTER TABLE "AffiliateLink" ADD COLUMN     "num" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "AffiliatePostback" DROP COLUMN "event",
ADD COLUMN     "events" TEXT[],
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'GET',
ADD COLUMN     "statusMap" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_num_key" ON "AffiliateLink"("num");


-- public link ids start at six digits
ALTER SEQUENCE "AffiliateLink_num_seq" RESTART WITH 100001;
