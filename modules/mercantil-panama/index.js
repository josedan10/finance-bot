import { MONTHS_TO_NUMBERS } from '../../src/enums/months.js';
import { PAYMENT_METHODS } from '../../src/enums/paymentMethods.js';
import excelModule from '../excel/excel.module.js';
import prisma from '../database/database.module.js';

class MercantilPanamaModule {
	constructor() {
		this._prisma = prisma;
	}

	async registerMercantilTransactionsFromCSVData(data) {
		const arrayData = await excelModule.parseCSVDataToJs(data, 2).filter((transaction) => transaction[0] !== '');
		const paymentMethod = await this._prisma.paymentMethod.findUnique({
			where: {
				name: PAYMENT_METHODS.MERCANTIL_PANAMA,
			},
			select: {
				id: true,
			},
		});

		const categories = await this._prisma.category.findMany({
			select: {
				id: true,
				keywords: true,
			},
		});

		console.log(`Registering ${arrayData.length} transactions`);

		const transactions = [];

		arrayData.forEach((transaction) => {
			// Example: 03/ENE/2023 parse into a valid date
			const [day, month, year] = transaction[0].split('/');
			const monthNumber = MONTHS_TO_NUMBERS[month];
			const date = new Date(`${year}-${monthNumber}-${day}`);
			const description = transaction[1];
			const amount = parseFloat(transaction[3]) || parseFloat(transaction[4]);
			const type = transaction[3] !== '' ? 'debit' : 'credit';

			// Check if the transaction has a category
			const category = categories.find((category) => {
				return category.keywords?.split(',')?.some((keyword) => {
					return description.toLowerCase().includes(keyword.toLowerCase());
				});
			});

			transactions.push(
				this._prisma.transaction.create({
					data: {
						date,
						paymentMethod: {
							connect: {
								id: paymentMethod.id,
							},
						},
						...(category && {
							category: {
								connect: {
									id: category?.id,
								},
							},
						}),
						currency: 'USD',
						referenceId: transaction[2],
						description,
						amount,
						type,
					},
				})
			);
		});

		return this._prisma.$transaction(transactions);
	}
}

export const MercantilPanama = new MercantilPanamaModule();
