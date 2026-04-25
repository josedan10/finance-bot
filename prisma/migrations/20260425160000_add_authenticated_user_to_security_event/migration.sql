ALTER TABLE `SecurityEvent`
  ADD COLUMN `authenticatedUserId` INTEGER NULL,
  ADD COLUMN `authenticatedUserEmail` VARCHAR(255) NULL;

CREATE INDEX `SecurityEvent_authenticatedUserEmail_createdAt_idx`
  ON `SecurityEvent`(`authenticatedUserEmail`, `createdAt`);
