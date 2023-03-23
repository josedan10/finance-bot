/*
  Warnings:

  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - A unique constraint covering the columns `[description,referenceId,date]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Transaction` MODIFY `date` DATETIME NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Transaction_description_referenceId_date_key` ON `Transaction`(`description`, `referenceId`, `date`);
