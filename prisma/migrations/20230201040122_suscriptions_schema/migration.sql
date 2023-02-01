/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `PaymentMethod` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `isMonthly` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `Suscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(20) NOT NULL,
    `type` VARCHAR(20) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Category_name_key` ON `Category`(`name`);

-- CreateIndex
CREATE UNIQUE INDEX `PaymentMethod_name_key` ON `PaymentMethod`(`name`);
