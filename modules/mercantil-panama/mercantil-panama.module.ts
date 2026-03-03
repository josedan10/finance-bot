import { MONTHS_TO_NUMBERS } from '../../src/enums/months';
import { PAYMENT_METHODS } from '../../src/enums/paymentMethods';
import excelModule from '../excel/excel.module';
import { PrismaModule as prisma } from '../database/database.module';
import { PrismaClient } from '@prisma/client';
import logger from '../../src/lib/logger';

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

interface CategoryWithKeywords {
	id: number;
	categoryKeyword: { keyword: { name: string } }[];
}

class MercantilPanamaModule {
	private _prisma: PrismaClient;

	constructor() {
		this._prisma = prisma;
	}

	async registerMercantilTransactionsFromCSVData(data: string): Promise<unknown[]> {
		const arrayData: string[][] = excelModule
			.parseCSVDataToJs(data, 2)
			.filter((transaction: string[]) => transaction[0] !== '');

		const paymentMethod = await this._prisma.paymentMethod.findUnique({
			where: {
				name_userId: {
					name: PAYMENT_METHODS.MERCANTIL_PANAMA,
					userId: 1
				},
			},
			select: {
				id: true,
			},
		});

		if (!paymentMethod) {
			throw new Error(`Payment method "${PAYMENT_METHODS.MERCANTIL_PANAMA}" not found`);
		}

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

		logger.info(`Registering ${arrayData.length} Mercantil transactions`);

		const transactions: TransactionData[] = [];

		arrayData.forEach((transaction) => {
			const [day, month, year] = transaction[0].split('/');
			const monthNumber = MONTHS_TO_NUMBERS[month as keyof typeof MONTHS_TO_NUMBERS];
			const date = new Date(`${year}-${monthNumber}-${day}`);
			const description = transaction[1];
			const amount = parseFloat(transaction[3]) || parseFloat(transaction[4]);
			const type: 'debit' | 'credit' = transaction[3] !== '' ? 'debit' : 'credit';

			const category = categories.find((cat: CategoryWithKeywords) => {
				return cat.categoryKeyword?.some((catKey) => {
					return description.toLowerCase().includes(catKey.keyword.name.toLowerCase());
				});
			});

			transactions.push({
				date,
				paymentMethodId: paymentMethod.id,
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
					user: { connect: { id: 1 } },
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
