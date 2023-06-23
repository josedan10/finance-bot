/*
  Warnings:

  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Transaction` MODIFY `date` DATETIME NOT NULL;

-- CreateTable
CREATE TABLE `DailyPrices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `monitorPrice` DECIMAL(10, 2) NULL,
    `bcvPrice` DECIMAL(10, 2) NULL,
    `date` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
