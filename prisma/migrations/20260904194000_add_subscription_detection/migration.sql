DROP INDEX `Suscription_name_userId_key` ON `Suscription`;
ALTER TABLE `Suscription`
  MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
  MODIFY COLUMN `type` VARCHAR(20) NOT NULL DEFAULT 'Monthly',
  ADD COLUMN `monthlyAmount` DECIMAL(10, 2) NULL,
  ADD COLUMN `currency` VARCHAR(3) NULL,
  ADD COLUMN `normalizedMerchant` VARCHAR(255) NULL,
  ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
CREATE UNIQUE INDEX `Suscription_user_merchant_currency_amount_key` ON `Suscription`(`userId`, `normalizedMerchant`, `currency`, `monthlyAmount`);
CREATE INDEX `Suscription_user_status_idx` ON `Suscription`(`userId`, `status`);
CREATE TABLE `SubscriptionTransaction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `subscriptionId` INTEGER NOT NULL,
  `transactionId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SubscriptionTransaction_subscriptionId_transactionId_key`(`subscriptionId`, `transactionId`),
  INDEX `SubscriptionTransaction_userId_idx`(`userId`),
  INDEX `SubscriptionTransaction_transactionId_idx`(`transactionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `SubscriptionTransaction` ADD CONSTRAINT `SubscriptionTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SubscriptionTransaction` ADD CONSTRAINT `SubscriptionTransaction_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Suscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SubscriptionTransaction` ADD CONSTRAINT `SubscriptionTransaction_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `Transaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
