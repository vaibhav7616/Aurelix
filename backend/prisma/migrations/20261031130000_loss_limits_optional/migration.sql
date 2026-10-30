-- Loss limits are optional (0 = no limit) and off by default.
UPDATE "RiskRule" SET "maxDailyLoss" = 0, "maxTotalLoss" = 0 WHERE "key" = 'global';
