/*
  Warnings:

  - A unique constraint covering the columns `[userId,endpoint]` on the table `PushSubscription` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `ShopCategory` DROP FOREIGN KEY `ShopCategory_categoryId_fkey`;

-- AlterTable
ALTER TABLE `BudgetFallbackRule` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX `PushSubscription_userId_endpoint_key` ON `PushSubscription`(`userId`, `endpoint`(191));

-- AddForeignKey
ALTER TABLE `ShopCategory` ADD CONSTRAINT `ShopCategory_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
