/* eslint-disable @typescript-eslint/no-explicit-any */
import { CATEGORIES, PAYMENT_METHODS_ARRAY, suscriptions } from '../src/enums/paymentMethods';
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

	const categories = Object.values(CATEGORIES).map((cat: any) => cat);

	const categoryLimits = [120, 200, 400, 200, 150, 200, 150, 100, 100, 200, 0, 0];

	for (const catInd in categories) {
		const categoryName = categories[catInd].name.toUpperCase();

		const category = await prisma.category.upsert({
			where: {
				name: categoryName,
			},
			update: {},
			create: {
				name: categoryName,
				amountLimit: categoryLimits[catInd],
			},
		});

		const keywords = categories[catInd].keywords;

		if (!keywords) continue;

		try {
			await prisma.keyword.createMany({
				data: keywords.map((keyword: string) => ({
					name: keyword,
				})),
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

			await prisma.categoryKeyword.upsert({
				where: {
					categoryId_keywordId: {
						categoryId: category.id,
						keywordId: getKeyWord?.id || 0,
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
							id: getKeyWord?.id || 0,
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
