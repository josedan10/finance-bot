/*
  Warnings:

  - You are about to drop the column `name` on the `TaskQueue` table. All the data in the column will be lost.
  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.

*/
-- DropIndex
DROP INDEX `TaskQueue_name_key` ON `TaskQueue`;

-- AlterTable
ALTER TABLE `TaskQueue` DROP COLUMN `name`;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `date` DATETIME NOT NULL;
