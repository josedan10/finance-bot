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
		await prisma.category.upsert({
			where: {
				name: categories[catInd].name.toUpperCase(),
			},
			update: {},
			create: {
				name: categories[catInd].name.toUpperCase(),
				keywords: categories[catInd].keywords?.join(','),
				amountLimit: categoryLimits[catInd],
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
