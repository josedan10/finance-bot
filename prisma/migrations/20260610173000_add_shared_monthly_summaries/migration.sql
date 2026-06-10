CREATE TABLE `SharedMonthlySummary` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `token` VARCHAR(64) NOT NULL,
  `month` INTEGER NOT NULL,
  `year` INTEGER NOT NULL,
  `title` VARCHAR(120) NULL,
  `revokedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SharedMonthlySummary_token_key`(`token`),
  INDEX `SharedMonthlySummary_userId_fkey`(`userId`),
  INDEX `SharedMonthlySummary_year_month_idx`(`year`, `month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SharedMonthlySummary`
  ADD CONSTRAINT `SharedMonthlySummary_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
