-- AlterTable
ALTER TABLE `Category` ADD COLUMN `isCumulative` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `BudgetPeriod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoryId` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `carryOver` DECIMAL(10, 2) NOT NULL DEFAULT 0,

    INDEX `BudgetPeriod_categoryId_fkey`(`categoryId`),
    UNIQUE INDEX `BudgetPeriod_categoryId_year_month_key`(`categoryId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BudgetPeriod` ADD CONSTRAINT `BudgetPeriod_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
