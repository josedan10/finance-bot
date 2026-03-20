-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `firebaseId` VARCHAR(128) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_firebaseId_key`(`firebaseId`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert Default User
INSERT INTO `User` (`id`, `firebaseId`, `email`) VALUES (1, 'default_tenant', 'default@financebot.local');

-- DropIndex
DROP INDEX `Category_name_key` ON `Category`;
DROP INDEX `Keyword_name_key` ON `Keyword`;
DROP INDEX `PaymentMethod_name_key` ON `PaymentMethod`;
DROP INDEX `PlatformMonthlyRegister_paymentMethodId_year_month_key` ON `PlatformMonthlyRegister`;
DROP INDEX `Shop_name_key` ON `Shop`;
DROP INDEX `Suscription_name_key` ON `Suscription`;
DROP INDEX `Transaction_description_referenceId_date_key` ON `Transaction`;

-- AlterTable
ALTER TABLE `Category` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `Keyword` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `PaymentMethod` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `PlatformMonthlyRegister` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `Shop` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `Suscription` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `Transaction` ADD COLUMN `userId` INTEGER NOT NULL DEFAULT 1;

-- AlterTable Drop Default
ALTER TABLE `Category` ALTER COLUMN `userId` DROP DEFAULT;
ALTER TABLE `Keyword` ALTER COLUMN `userId` DROP DEFAULT;
ALTER TABLE `PaymentMethod` ALTER COLUMN `userId` DROP DEFAULT;
ALTER TABLE `PlatformMonthlyRegister` ALTER COLUMN `userId` DROP DEFAULT;
ALTER TABLE `Shop` ALTER COLUMN `userId` DROP DEFAULT;
ALTER TABLE `Suscription` ALTER COLUMN `userId` DROP DEFAULT;
ALTER TABLE `Transaction` ALTER COLUMN `userId` DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX `Category_name_userId_key` ON `Category`(`name`, `userId`);
CREATE UNIQUE INDEX `Keyword_name_userId_key` ON `Keyword`(`name`, `userId`);
CREATE UNIQUE INDEX `PaymentMethod_name_userId_key` ON `PaymentMethod`(`name`, `userId`);
CREATE UNIQUE INDEX `PlatformMonthlyRegister_paymentMethodId_year_month_userId_key` ON `PlatformMonthlyRegister`(`paymentMethodId`, `year`, `month`, `userId`);
CREATE UNIQUE INDEX `Shop_name_userId_key` ON `Shop`(`name`, `userId`);
CREATE UNIQUE INDEX `Suscription_name_userId_key` ON `Suscription`(`name`, `userId`);
CREATE UNIQUE INDEX `Transaction_description_referenceId_date_userId_key` ON `Transaction`(`description`, `referenceId`, `date`, `userId`);

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Keyword` ADD CONSTRAINT `Keyword_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaymentMethod` ADD CONSTRAINT `PaymentMethod_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PlatformMonthlyRegister` ADD CONSTRAINT `PlatformMonthlyRegister_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Suscription` ADD CONSTRAINT `Suscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Shop` ADD CONSTRAINT `Shop_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
