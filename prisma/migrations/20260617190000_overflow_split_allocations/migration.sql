ALTER TABLE `BudgetOverflowAssignment` DROP FOREIGN KEY `BudgetOverflowAssignment_targetCategoryId_fkey`;

ALTER TABLE `BudgetOverflowAssignment`
  ADD COLUMN `amount` DECIMAL(10,2) NULL,
  ADD COLUMN `sourceTransactionId` INT NULL,
  MODIFY `targetCategoryId` INT NULL;

CREATE TABLE `BudgetOverflowAllocation` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `assignmentId` INT NOT NULL,
  `targetCategoryId` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `targetTransactionId` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `budget_overflow_allocation_assignment_target_uq`(`assignmentId`, `targetCategoryId`),
  INDEX `BudgetOverflowAllocation_userId_fkey`(`userId`),
  INDEX `BudgetOverflowAllocation_targetCategoryId_fkey`(`targetCategoryId`),
  INDEX `BudgetOverflowAllocation_targetTransactionId_fkey`(`targetTransactionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `BudgetOverflowAssignment_sourceTransactionId_fkey` ON `BudgetOverflowAssignment`(`sourceTransactionId`);

ALTER TABLE `BudgetOverflowAssignment`
  ADD CONSTRAINT `BudgetOverflowAssignment_sourceTransactionId_fkey`
  FOREIGN KEY (`sourceTransactionId`) REFERENCES `Transaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `BudgetOverflowAssignment`
  ADD CONSTRAINT `BudgetOverflowAssignment_targetCategoryId_fkey`
  FOREIGN KEY (`targetCategoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `BudgetOverflowAllocation`
  ADD CONSTRAINT `BudgetOverflowAllocation_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BudgetOverflowAllocation_assignmentId_fkey`
  FOREIGN KEY (`assignmentId`) REFERENCES `BudgetOverflowAssignment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BudgetOverflowAllocation_targetCategoryId_fkey`
  FOREIGN KEY (`targetCategoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BudgetOverflowAllocation_targetTransactionId_fkey`
  FOREIGN KEY (`targetTransactionId`) REFERENCES `Transaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
