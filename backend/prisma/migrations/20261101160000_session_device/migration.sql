-- Per-browser device id on sessions (affiliate fraud checks: same device as the partner)
ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");
