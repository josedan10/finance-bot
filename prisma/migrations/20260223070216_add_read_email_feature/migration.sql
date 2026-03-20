/*
  Warnings:

  - A unique constraint covering the columns `[date]` on the table `DailyExchangeRate` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE `ProcessedEmail` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `messageId` VARCHAR(255) NOT NULL,
    `from` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(500) NOT NULL,
    `result` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProcessedEmail_messageId_key`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `DailyExchangeRate_date_key` ON `DailyExchangeRate`(`date`);

-- CreateIndex
CREATE INDEX `DailyExchangeRate_date_idx` ON `DailyExchangeRate`(`date`);

-- CreateIndex
CREATE INDEX `TaskQueue_type_status_idx` ON `TaskQueue`(`type`, `status`);
