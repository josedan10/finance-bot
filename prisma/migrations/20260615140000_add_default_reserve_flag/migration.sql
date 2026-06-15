-- Add a default reserve marker to categories
ALTER TABLE `Category`
ADD COLUMN `isDefaultReserve` BOOLEAN NOT NULL DEFAULT false;
