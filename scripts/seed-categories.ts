import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const USER_ID = 1;

const CATEGORIES = [
  { name: 'Transportation', keywords: ['didi', 'tembici', 'uber', 'cabify', 'taxi', 'sube', 'emova', 'subte', 'merpago*tembici', 'dlo*didi', 'dlo*diDi'] },
  { name: 'Investment', keywords: ['belo'] },
  { name: 'Health & Fitness', keywords: ['swiss medical', 'farmacity', 'farmacia', 'gym', 'doctor', 'swiss medical-clinicas'] },
  { name: 'Food & Dining', keywords: ['rappi', 'pedidosya', 'starbucks', 'mc donalds', 'havanna', 'pizza', 'burgio', 'market', 'supermercado', 'quecachapa', 'restaurant'] },
  { name: 'Shopping', keywords: ['mercado libre', 'amazon', 'fravega', 'shopping', 'purchase'] },
  { name: 'Entertainment', keywords: ['netflix', 'spotify', 'disney', 'prime', 'youtube', 'hbo', 'patreon', 'showcase', 'cinema'] },
  { name: 'Bills & Utilities', keywords: ['google one', 'icloud', 'internet', 'bill', 'phone'] }
];

async function main() {
  console.log('--- Starting Category & Keyword Seeding for User 1 ---');

  for (const catData of CATEGORIES) {
    try {
      const category = await prisma.category.upsert({
        where: { name_userId: { name: catData.name, userId: USER_ID } },
        update: {},
        create: { name: catData.name, userId: USER_ID }
      });
      console.log(`✅ Category "${catData.name}" created or found.`);

      for (const kwName of catData.keywords) {
        const keyword = await prisma.keyword.upsert({
          where: { name_userId: { name: kwName, userId: USER_ID } },
          update: {},
          create: { name: kwName, userId: USER_ID }
        });

        await prisma.categoryKeyword.upsert({
          where: { categoryId_keywordId: { categoryId: category.id, keywordId: keyword.id } },
          update: {},
          create: { categoryId: category.id, keywordId: keyword.id }
        });
        console.log(`  -> Linked keyword "${kwName}"`);
      }
    } catch (e) {
      console.error(`Failed to process category "${catData.name}":`, e);
    }
  }

  console.log('\\n--- Seeding Complete ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
