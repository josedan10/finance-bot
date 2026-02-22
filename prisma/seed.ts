import { CATEGORIES, PAYMENT_METHODS_ARRAY, suscriptions } from '../src/enums';
import { PrismaModule as prisma } from '../modules/database/database.module';

async function main() {
	const paymentMethods = Object.values(PAYMENT_METHODS_ARRAY).map((method: string) => method);

	for (const paymentMethod of paymentMethods) {
		await prisma.paymentMethod.upsert({
			where: {
				name: paymentMethod.toUpperCase(),
			},
			update: {},
			create: {
				name: paymentMethod.toUpperCase(),
			},
		});
	}

	const categories = Object.values(CATEGORIES);

	const categoryLimits: Record<string, number> = {
		Pet: 120,
		Purchase: 200,
		'Food/Home': 400,
		Entertainment: 200,
		Other: 150,
		Health: 200,
		Donation: 150,
		Transport: 100,
		Vehicle: 100,
		Loans: 200,
		Exchange: 0,
		Work: 0,
		Travel: 0,
		Beauty: 0,
		Education: 0,
	};

	for (const cat of categories) {
		const categoryName = cat.name.toUpperCase();
		const limit = categoryLimits[cat.name] ?? 0;

		const category = await prisma.category.upsert({
			where: {
				name: categoryName,
			},
			update: {},
			create: {
				name: categoryName,
				amountLimit: limit,
			},
		});

		const keywords = 'keywords' in cat ? (cat.keywords as string[]) : undefined;

		if (!keywords) continue;

		try {
			await prisma.keyword.createMany({
				data: keywords.map((keyword: string) => ({
					name: keyword,
				})),
				skipDuplicates: true,
			});
		} catch (e) {
			console.error(e);
		}

		for (const keyword of keywords) {
			const getKeyWord = await prisma.keyword.findUnique({
				where: {
					name: keyword,
				},
			});

			if (!getKeyWord) {
				console.error(`Keyword "${keyword}" not found, skipping category-keyword link`);
				continue;
			}

			await prisma.categoryKeyword.upsert({
				where: {
					categoryId_keywordId: {
						categoryId: category.id,
						keywordId: getKeyWord.id,
					},
				},
				update: {},
				create: {
					category: {
						connect: {
							id: category.id,
						},
					},
					keyword: {
						connect: {
							id: getKeyWord.id,
						},
					},
				},
			});
		}
	}

	for (const suscription of suscriptions) {
		await prisma.suscription.upsert({
			where: {
				name: suscription.name,
			},
			update: {},
			create: {
				name: suscription.name,
				type: suscription.type,
				paymentDate: suscription?.paymentDate || null,
			},
		});
	}
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error(e);
		await prisma.$disconnect();
		process.exit(1);
	});
