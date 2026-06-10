CREATE TABLE `HistoricalExchangeRate` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `baseCurrency` VARCHAR(3) NOT NULL,
  `quoteCurrency` VARCHAR(3) NOT NULL,
  `source` VARCHAR(30) NOT NULL,
  `sourceKey` VARCHAR(30) NOT NULL,
  `rateDate` DATETIME(3) NOT NULL,
  `buyPrice` DECIMAL(10, 6) NULL,
  `sellPrice` DECIMAL(10, 6) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `hist_rate_pair_source_date_uq`(`baseCurrency`, `quoteCurrency`, `source`, `sourceKey`, `rateDate`),
  INDEX `HistoricalExchangeRate_quoteCurrency_rateDate_idx`(`quoteCurrency`, `rateDate`),
  INDEX `HistoricalExchangeRate_source_sourceKey_rateDate_idx`(`source`, `sourceKey`, `rateDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
