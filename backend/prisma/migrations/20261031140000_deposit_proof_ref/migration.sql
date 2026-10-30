-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN "proofRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_proofRef_key" ON "Deposit"("proofRef");
