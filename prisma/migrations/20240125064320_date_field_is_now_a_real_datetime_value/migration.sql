/*
  Warnings:

  - You are about to alter the column `date` on the `DailyExchangeRate` table. The data in that column could be lost. The data in that column will be cast from `VarChar(10)` to `DateTime(3)`.

*/
-- DropIndex
DROP INDEX `DailyExchangeRate_date_key` ON `DailyExchangeRate`;

-- AlterTable
ALTER TABLE `DailyExchangeRate` MODIFY `date` DATETIME(3) NOT NULL;
