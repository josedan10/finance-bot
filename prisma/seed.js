const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
	const paymentMethods = ['Payoneer', 'Mercantil Panamá', 'Paypal', 'Cash'];

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

	const categories = [
		'Pet',
		'Purchase',
		'Food/Home',
		'Entertaiment',
		'Other',
		'Health',
		'Donation',
		'Transport',
		'Vehicle',
		'Loans',
		'Exchange',
		'Work',
	];

	const categoryLimits = [120, 200, 400, 200, 150, 200, 150, 100, 100, 200, 0, 0];

	for (const catInd in categories) {
		await prisma.category.upsert({
			where: {
				name: categories[catInd].toUpperCase(),
			},
			update: {},
			create: {
				name: categories[catInd].toUpperCase(),
				amountLimit: categoryLimits[catInd],
			},
		});
	}

	const suscriptions = [
		{
			name: 'AMAZON PRIME',
			type: 'MONTHLY',
		},
		{
			name: 'MEDIUM',
			type: 'ANNUAL',
		},
		{
			name: 'DISNEY PLUS',
			type: 'MONTHLY',
		},
		{
			name: 'PLATZI',
			type: 'ANNUAL',
		},
		{
			name: 'LASTPASS',
			type: 'ANNUAL',
		},
		{
			name: 'DIGITAL OCEAN',
			type: 'MONTHLY',
		},
		{
			name: 'EXPRESSVPN',
			type: 'ANNUAL',
		},
		{
			name: 'GOOGLE ONE',
			type: 'ANNUAL',
		},
		{
			name: 'GYM',
			type: 'MONTHLY',
		},
		{
			name: 'CÓDIGO FACILITO',
			type: 'ANNUAL',
		},
	];

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
