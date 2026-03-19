import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

const CSV_PATH = path.join(__dirname, '../modules/reports/report_2026-03-16_15-50-54.csv');
const USER_ID = 1;

// Define simple, robust mappings based on CSV content
const KEYWORD_TO_CATEGORY_MAP: { [key: string]: string } = {
  'didi': 'Transportation',
  'tembici': 'Transportation',
  'belo': 'Investment',
  'swiss medical': 'Health & Fitness',
  'farmacity': 'Health & Fitness',
  'rappi': 'Food & Dining',
  'pedidosya': 'Food & Dining',
  'starbucks': 'Food & Dining',
  'mercado libre': 'Shopping',
  'amazon': 'Shopping',
  'netflix': 'Entertainment',
  'spotify': 'Entertainment',
  'steam': 'Entertainment',
  'merpago*tembici': 'Transportation',
  'dlo*didi': 'Transportation',
  'dlo*diDi': 'Transportation',
  'swiss medical-clinicas': 'Health & Fitness'
};

async function main() {
  console.log('--- Starting Keyword Population from CSV ---');
  
  const fileContent = fs.readFileSync(CSV_PATH, { encoding: 'utf-8' });
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });
  console.log(`Loaded ${records.length} rows from CSV`);

  const categories = await prisma.category.findMany({ where: { userId: USER_ID } });
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

  let keywordsCreated = 0;

  for (const [keyword, categoryName] of Object.entries(KEYWORD_TO_CATEGORY_MAP)) {
    const lowerCaseCategoryName = categoryName.toLowerCase();
    
    if (!categoryMap.has(lowerCaseCategoryName)) {
      console.warn(`Category "${categoryName}" not found for keyword "${keyword}". Skipping.`);
      continue;
    }

    const categoryId = categoryMap.get(lowerCaseCategoryName);
    
    try {
      // Create keyword if it doesn't exist
      const kw = await prisma.keyword.upsert({
        where: { name_userId: { name: keyword, userId: USER_ID } },
        update: {},
        create: { name: keyword, userId: USER_ID }
      });

      // Link keyword to category
      await prisma.categoryKeyword.upsert({
        where: { categoryId_keywordId: { categoryId: categoryId!, keywordId: kw.id } },
        update: {},
        create: { categoryId: categoryId!, keywordId: kw.id }
      });

      keywordsCreated++;
      console.log(`Associated keyword "${keyword}" with category "${categoryName}"`);

    } catch (e) {
      console.error(`Failed to process keyword "${keyword}":`, e);
    }
  }

  console.log(`
--- Finished: ${keywordsCreated} keyword associations created or verified. ---`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
