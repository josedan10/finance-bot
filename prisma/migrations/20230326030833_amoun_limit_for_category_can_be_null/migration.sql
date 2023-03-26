/*
  Warnings:

  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- AlterTable
ALTER TABLE `Category` MODIFY `amountLimit` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `date` DATETIME NOT NULL;
