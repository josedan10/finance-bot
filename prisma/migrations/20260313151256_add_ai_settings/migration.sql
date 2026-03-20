-- CreateTable
CREATE TABLE `AISettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `aiEnabled` BOOLEAN NOT NULL DEFAULT false,
    `aiProvider` ENUM('GEMINI', 'CHATGPT') NOT NULL DEFAULT 'GEMINI',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AISettings_userId_key`(`userId`),
    INDEX `AISettings_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AISettings` ADD CONSTRAINT `AISettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
