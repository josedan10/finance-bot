import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.category.findMany({
    where: { userId: 1 },
    include: {
      categoryKeyword: {
        include: {
          keyword: true
        }
      }
    }
  });

  console.log('--- Categories and Keywords for User 1 ---');
  categories.forEach(cat => {
    const keywords = cat.categoryKeyword.map(ck => ck.keyword.name).join(', ');
    console.log(`[${cat.id}] ${cat.name}: ${keywords || '(No keywords)'}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
