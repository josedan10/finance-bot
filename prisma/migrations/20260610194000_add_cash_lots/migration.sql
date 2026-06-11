-- CreateTable
CREATE TABLE `CashLot` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `withdrawalTransactionId` INT NULL,
  `withdrawalDate` DATETIME(3) NOT NULL,
  `sourceAmount` DECIMAL(10, 2) NOT NULL,
  `sourceCurrency` VARCHAR(3) NOT NULL,
  `destinationAmount` DECIMAL(10, 2) NOT NULL,
  `destinationCurrency` VARCHAR(3) NOT NULL,
  `exchangeRate` DECIMAL(10, 6) NOT NULL,
  `remainingAmount` DECIMAL(10, 2) NOT NULL,
  `migrationStatus` VARCHAR(20) NOT NULL DEFAULT 'linked',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CashLot_withdrawalTransactionId_key`(`withdrawalTransactionId`),
  INDEX `CashLot_userId_fkey`(`userId`),
  INDEX `CashLot_destinationCurrency_withdrawalDate_idx`(`destinationCurrency`, `withdrawalDate`),
  INDEX `CashLot_user_dest_migration_withdrawal_id_idx`(`userId`, `destinationCurrency`, `migrationStatus`, `withdrawalDate`, `id`),

  CONSTRAINT `CashLot_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CashLot_withdrawalTransactionId_fkey`
    FOREIGN KEY (`withdrawalTransactionId`) REFERENCES `Transaction`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CashLotAllocation` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `cashLotId` INT NOT NULL,
  `expenseTransactionId` INT NOT NULL,
  `allocatedAmount` DECIMAL(10, 2) NOT NULL,
  `exchangeRate` DECIMAL(10, 6) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `cash_lot_allocation_uq`(`cashLotId`, `expenseTransactionId`),
  INDEX `CashLotAllocation_userId_fkey`(`userId`),
  INDEX `CashLotAllocation_expenseTransactionId_fkey`(`expenseTransactionId`),

  CONSTRAINT `CashLotAllocation_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CashLotAllocation_cashLotId_fkey`
    FOREIGN KEY (`cashLotId`) REFERENCES `CashLot`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CashLotAllocation_expenseTransactionId_fkey`
    FOREIGN KEY (`expenseTransactionId`) REFERENCES `Transaction`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Historical cash withdrawal backfill.
-- Linked records are created from clearly identifiable withdrawal transactions.
-- Ambiguous matches are preserved as review-only records with zero values.
INSERT INTO `CashLot` (
  `userId`,
  `withdrawalTransactionId`,
  `withdrawalDate`,
  `sourceAmount`,
  `sourceCurrency`,
  `destinationAmount`,
  `destinationCurrency`,
  `exchangeRate`,
  `remainingAmount`,
  `migrationStatus`,
  `createdAt`,
  `updatedAt`
)
SELECT
  t.`userId`,
  CASE
    WHEN (
      LOWER(COALESCE(t.`description`, '')) LIKE '%withdraw%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%withdrawal%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%atm%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%retiro%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%cash out%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%cash withdrawal%'
    )
    AND COALESCE(t.`amount`, 0) > 0
    AND COALESCE(t.`originalCurrencyAmount`, 0) > 0
    THEN t.`id`
    ELSE NULL
  END,
  t.`date`,
  COALESCE(t.`amount`, 0),
  'USD',
  COALESCE(t.`originalCurrencyAmount`, 0),
  UPPER(COALESCE(t.`currency`, 'USD')),
  CASE
    WHEN COALESCE(t.`amount`, 0) > 0 AND COALESCE(t.`originalCurrencyAmount`, 0) > 0 THEN COALESCE(t.`exchangeRateUsed`, t.`originalCurrencyAmount` / t.`amount`)
    ELSE COALESCE(t.`exchangeRateUsed`, 1)
  END,
  COALESCE(t.`originalCurrencyAmount`, 0),
  CASE
    WHEN (
      LOWER(COALESCE(t.`description`, '')) LIKE '%withdraw%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%withdrawal%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%atm%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%retiro%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%cash out%'
      OR LOWER(COALESCE(t.`description`, '')) LIKE '%cash withdrawal%'
    )
    AND COALESCE(t.`amount`, 0) > 0
    AND COALESCE(t.`originalCurrencyAmount`, 0) > 0
    THEN 'linked'
    ELSE 'unlinked'
  END,
  NOW(3),
  NOW(3)
FROM `Transaction` t
LEFT JOIN `CashLot` c ON c.`withdrawalTransactionId` = t.`id`
WHERE t.`type` = 'expense'
  AND c.`id` IS NULL
  AND (
    LOWER(COALESCE(t.`description`, '')) LIKE '%withdraw%'
    OR LOWER(COALESCE(t.`description`, '')) LIKE '%withdrawal%'
    OR LOWER(COALESCE(t.`description`, '')) LIKE '%atm%'
    OR LOWER(COALESCE(t.`description`, '')) LIKE '%retiro%'
    OR LOWER(COALESCE(t.`description`, '')) LIKE '%cash out%'
    OR LOWER(COALESCE(t.`description`, '')) LIKE '%cash withdrawal%'
  );
