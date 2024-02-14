/*
  Warnings:

  - You are about to drop the column `keywords` on the `Category` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Category` DROP COLUMN `keywords`;

-- CreateTable
CREATE TABLE `Keyword` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(20) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `Keyword_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CategoryKeyword` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoryId` INTEGER NOT NULL,
    `keywordId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CategoryKeyword` ADD CONSTRAINT `CategoryKeyword_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CategoryKeyword` ADD CONSTRAINT `CategoryKeyword_keywordId_fkey` FOREIGN KEY (`keywordId`) REFERENCES `Keyword`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
