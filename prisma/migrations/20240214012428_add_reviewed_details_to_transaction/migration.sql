-- AlterTable
ALTER TABLE `Transaction` ADD COLUMN `reviewed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL;
