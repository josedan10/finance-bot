CREATE TABLE `BudgetOverflowAssignment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `sourceCategoryId` INTEGER NOT NULL,
  `targetCategoryId` INTEGER NOT NULL,
  `month` INTEGER NOT NULL,
  `year` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `budget_overflow_assignment_source_month_uq`(`userId`, `sourceCategoryId`, `month`, `year`),
  INDEX `BudgetOverflowAssignment_userId_fkey`(`userId`),
  INDEX `BudgetOverflowAssignment_targetCategoryId_fkey`(`targetCategoryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BudgetOverflowAssignment`
  ADD CONSTRAINT `BudgetOverflowAssignment_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BudgetOverflowAssignment`
  ADD CONSTRAINT `BudgetOverflowAssignment_sourceCategoryId_fkey`
  FOREIGN KEY (`sourceCategoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `BudgetOverflowAssignment`
  ADD CONSTRAINT `BudgetOverflowAssignment_targetCategoryId_fkey`
  FOREIGN KEY (`targetCategoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
