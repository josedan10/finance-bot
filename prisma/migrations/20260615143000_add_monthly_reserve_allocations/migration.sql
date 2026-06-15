-- Track monthly surplus allocations into the default reserve
CREATE TABLE `MonthlyReserveAllocation` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `categoryId` INT NOT NULL,
  `month` INT NOT NULL,
  `year` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `MonthlyReserveAllocation_userId_month_year_key` ON `MonthlyReserveAllocation`(`userId`, `month`, `year`);
CREATE INDEX `MonthlyReserveAllocation_categoryId_fkey` ON `MonthlyReserveAllocation`(`categoryId`);
CREATE INDEX `MonthlyReserveAllocation_userId_fkey` ON `MonthlyReserveAllocation`(`userId`);

ALTER TABLE `MonthlyReserveAllocation`
  ADD CONSTRAINT `MonthlyReserveAllocation_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MonthlyReserveAllocation`
  ADD CONSTRAINT `MonthlyReserveAllocation_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
