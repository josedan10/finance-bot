import { MONTHS_TO_NUMBERS } from '../../src/enums/months';
import { PAYMENT_METHODS } from '../../src/enums/paymentMethods';
import excelModule from '../excel/excel.module';
import { PrismaModule as prisma } from '../database/database.module';
import { PrismaClient } from '.prisma/client';

interface TransactionData {
	date: Date;
	paymentMethodId: number;
	categoryId?: number;
	currency: string;
	referenceId: string;
	description: string;
	amount: number;
	type: 'debit' | 'credit';
}

class MercantilPanamaModule {
	private _prisma: PrismaClient;

	constructor() {
		this._prisma = prisma;
	}

	// TODO: Refactor this function
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async registerMercantilTransactionsFromCSVData(data: string): Promise<any[]> {
		const arrayData: string[][] = excelModule
			.parseCSVDataToJs(data, 2)
			.filter((transaction: string[]) => transaction[0] !== '');

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
				categoryKeyword: {
					select: {
						keyword: true,
					},
				},
			},
		});

		console.log(`Registering ${arrayData.length} transactions`);

		const transactions: TransactionData[] = [];

		arrayData.forEach((transaction) => {
			// Example: 03/ENE/2023 parse into a valid date
			const [day, month, year] = transaction[0].split('/');
			const monthNumber = MONTHS_TO_NUMBERS[month as keyof typeof MONTHS_TO_NUMBERS];
			const date = new Date(`${year}-${monthNumber}-${day}`);
			const description = transaction[1];
			const amount = parseFloat(transaction[3]) || parseFloat(transaction[4]);
			const type: 'debit' | 'credit' = transaction[3] !== '' ? 'debit' : 'credit';

			// Check if the transaction has a category
			const category = categories.find((category: { id: number; categoryKeyword: { keyword: { name: string } }[] }) => {
				return category.categoryKeyword?.some((catKey) => {
					return description.toLowerCase().includes(catKey.keyword.name.toLowerCase());
				});
			});

			transactions.push({
				date,
				paymentMethodId: paymentMethod?.id ?? 0,
				categoryId: category?.id,
				currency: 'USD',
				referenceId: transaction[2],
				description,
				amount,
				type,
			});
		});

		const createTransactionsPromises = transactions.map((transaction) =>
			this._prisma.transaction.create({
				data: {
					date: transaction.date,
					paymentMethod: {
						connect: {
							id: transaction.paymentMethodId,
						},
					},
					...(transaction.categoryId && {
						category: {
							connect: {
								id: transaction.categoryId,
							},
						},
					}),
					currency: transaction.currency,
					referenceId: transaction.referenceId,
					description: transaction.description,
					amount: transaction.amount,
					type: transaction.type,
				},
			})
		);

		return this._prisma.$transaction(createTransactionsPromises);
	}
}

export const MercantilPanama = new MercantilPanamaModule();
