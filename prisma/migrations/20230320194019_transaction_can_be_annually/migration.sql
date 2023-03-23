/*
  Warnings:

  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `isAnnually` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `date` DATETIME NOT NULL;
