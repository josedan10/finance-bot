/*
  Warnings:

  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(6)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Transaction` MODIFY `date` DATETIME NOT NULL;
