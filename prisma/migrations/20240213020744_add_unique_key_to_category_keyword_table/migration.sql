/*
  Warnings:

  - A unique constraint covering the columns `[categoryId,keywordId]` on the table `CategoryKeyword` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `CategoryKeyword_categoryId_keywordId_key` ON `CategoryKeyword`(`categoryId`, `keywordId`);
