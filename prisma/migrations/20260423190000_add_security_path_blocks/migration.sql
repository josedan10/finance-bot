CREATE TABLE `SecurityPathBlock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `normalizedPath` VARCHAR(255) NOT NULL,
    `matchType` VARCHAR(20) NOT NULL DEFAULT 'exact',
    `reason` VARCHAR(255) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `removedAt` DATETIME(3) NULL,
    `removedBy` INTEGER NULL,
    `metadataJson` JSON NULL,

    UNIQUE INDEX `SecurityPathBlock_normalizedPath_matchType_key`(`normalizedPath`, `matchType`),
    INDEX `SecurityPathBlock_active_updatedAt_idx`(`active`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
