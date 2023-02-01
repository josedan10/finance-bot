/*
  Warnings:

  - A unique constraint covering the columns `[paymentMethodId,year,month]` on the table `PlatformMonthlyRegister` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `Shop` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `Suscription` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX `PlatformMonthlyRegister_paymentMethodId_year_month_idx` ON `PlatformMonthlyRegister`(`paymentMethodId`, `year`, `month`);

-- CreateIndex
CREATE UNIQUE INDEX `PlatformMonthlyRegister_paymentMethodId_year_month_key` ON `PlatformMonthlyRegister`(`paymentMethodId`, `year`, `month`);

-- CreateIndex
CREATE UNIQUE INDEX `Shop_name_key` ON `Shop`(`name`);

-- CreateIndex
CREATE UNIQUE INDEX `Suscription_name_key` ON `Suscription`(`name`);
