import { CATEGORIES, PAYMENT_METHODS, suscriptions } from '../src/enums/paymentMethods.js';
import prisma from '../modules/database/database.module.js';
async function main() {
	const paymentMethods = Object.values(PAYMENT_METHODS).map((method) => method);

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

	const categories = Object.values(CATEGORIES).map((cat) => cat);

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

		const keyword = await prisma.keyword.upsert({
			where: {
				name: categoryName,
			},
			update: {},
			create: {
				name: categoryName,
			},
		});

		await prisma.categoryKeyword.upsert({
			where: {
				categoryId_keywordId: {
					categoryId: category.id,
					keywordId: keyword.id,
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
						id: keyword.id,
					},
				},
			},
		});
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
