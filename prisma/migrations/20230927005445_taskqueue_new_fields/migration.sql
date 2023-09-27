/*
  Warnings:

  - You are about to alter the column `date` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DateTime(0)` to `DateTime`.
  - Added the required column `type` to the `TaskQueue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `TaskQueue` ADD COLUMN `attemptsRemaining` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `status` VARCHAR(15) NOT NULL DEFAULT 'pending',
    ADD COLUMN `type` VARCHAR(20) NOT NULL,
    MODIFY `body` TEXT NULL;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `date` DATETIME NOT NULL;
