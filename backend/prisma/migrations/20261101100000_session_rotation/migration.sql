-- Refresh-token rotation (rotatedAt) and "remember me" (persistent) on sessions
ALTER TABLE "Session" ADD COLUMN "rotatedAt" TIMESTAMP(3),
ADD COLUMN "persistent" BOOLEAN NOT NULL DEFAULT true;
