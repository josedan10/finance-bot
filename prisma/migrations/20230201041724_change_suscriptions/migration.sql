/*
  Warnings:

  - Added the required column `paymentDate` to the `Suscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Suscriptions` ADD COLUMN `paymentDate` VARCHAR(10) NOT NULL;
