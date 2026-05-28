ALTER TABLE `User`
ADD COLUMN `onboardingStatus` VARCHAR(20) NOT NULL DEFAULT 'approved',
ADD COLUMN `approvalRequestedAt` DATETIME(3) NULL,
ADD COLUMN `approvedAt` DATETIME(3) NULL;
