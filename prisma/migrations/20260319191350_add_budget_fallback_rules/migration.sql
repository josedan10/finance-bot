CREATE TABLE `BudgetFallbackRule` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `sourceCategoryId` INTEGER NOT NULL,
  `targetCategoryId` INTEGER NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `BudgetFallbackRule_userId_sourceCategoryId_key`(`userId`, `sourceCategoryId`),
  INDEX `BudgetFallbackRule_userId_idx`(`userId`),
  INDEX `BudgetFallbackRule_targetCategoryId_idx`(`targetCategoryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BudgetFallbackRule`
  ADD CONSTRAINT `BudgetFallbackRule_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BudgetFallbackRule_sourceCategoryId_fkey`
    FOREIGN KEY (`sourceCategoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BudgetFallbackRule_targetCategoryId_fkey`
    FOREIGN KEY (`targetCategoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
