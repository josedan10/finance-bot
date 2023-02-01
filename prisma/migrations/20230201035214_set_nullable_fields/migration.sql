-- AlterTable
ALTER TABLE `Category` MODIFY `description` VARCHAR(255) NULL,
    MODIFY `keywords` TEXT NULL;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `description` VARCHAR(255) NULL;
