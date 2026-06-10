ALTER TABLE `Transaction`
  ADD COLUMN `exchangeRateUsed` DECIMAL(10, 6) NULL,
  ADD COLUMN `exchangeRateSource` VARCHAR(30) NULL,
  ADD COLUMN `exchangeRateSourceKey` VARCHAR(30) NULL;
