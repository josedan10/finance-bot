import dayjs from 'dayjs';
import { PAYMENT_METHODS } from '../../src/enums/paymentMethods';
import excelModule from '../excel/excel.module';
import { PrismaModule as prisma } from '../database/database.module';
import logger from '../../src/lib/logger';
import { BaseTransactions } from '../base-transactions/base-transactions.module';

class PaypalModule {
	name: string;
	columnNames: string[];
	columnIndexes: number[];
	numberOfColumns: number;
	private _prisma: typeof prisma;

	constructor() {
		this.name = 'Paypal';
		this.columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'M', 'P', 'AL', 'AM', 'AO'];
		this.columnIndexes = this.columnNames.map((columnName) => this.getColumnIndex(columnName));
		this.numberOfColumns = 41;
		this._prisma = prisma;
	}

	getColumnIndex(columnName: string): number {
		let index = 0;
		for (let i = 0; i < columnName.length; i++) {
			const charCode = columnName.charCodeAt(i) - 65;
			index += charCode + 26 * i;
		}
		return index;
	}

	getDataFromCSVData(csvData: string[][]): string[][] {
		const withoutEmptyRows = csvData?.filter((row) => row?.[0]?.length > 0);
		if (!withoutEmptyRows?.length || withoutEmptyRows.some((row) => row.length < this.numberOfColumns)) return [];
		const extractedValues: string[][] = [];
		withoutEmptyRows.forEach((row) => {
			const extractedRow: string[] = [];
			this.columnIndexes.forEach((index) => {
				extractedRow.push(row[index]);
			});
			extractedValues.push(extractedRow);
		});
		return extractedValues;
	}

	async registerPaypalDataFromCSVData(csvData: string, userId: number = 1): Promise<unknown[]> {
		const parsedData = excelModule.parseCSVDataToJs(csvData, 1);
		const paypalData = this.getDataFromCSVData(parsedData);

		const paymentMethod = await this._prisma.paymentMethod.findUnique({
			where: {
				name_userId: {
					name: PAYMENT_METHODS.PAYPAL,
					userId,
				},
			},
			select: {
				id: true,
			},
		});

		if (!paymentMethod) {
			throw new Error(`Payment method "${PAYMENT_METHODS.PAYPAL}" not found`);
		}

		const categories = await this._prisma.category.findMany({
			where: { userId },
			select: {
				id: true,
				categoryKeyword: {
					select: {
						keyword: true,
					},
				},
			},
		});

		logger.info(`Registering ${paypalData.length} PayPal transactions for user ${userId}`);

		const results = [];
		for (const transaction of paypalData) {
			const [
				ppDate,
				time,
				,
				name,
				transactionPaypalType,
				,
				currency,
				amount,
				referenceId,
				articleName,
				subject,
				note,
				typeToRegister,
			] = transaction;

			const description = `${articleName} - ${subject} - ${note} / ${transactionPaypalType} (${name})`;
			const category = categories.find((cat: { id: number; categoryKeyword: { keyword: { name: string } }[] }) => {
				return cat.categoryKeyword?.some((catKey: { keyword: { name: string } }) => {
					return description.toLowerCase().includes(catKey.keyword.name.toLowerCase());
				});
			});

			const correctFormatedDate = ppDate
				.split('/')
				.map((value) => (value.length === 1 ? `0${value}` : value))
				.reverse()
				.join('/');
			const correctFormatedTime = time
				.split(':')
				.map((value) => (value.length === 1 ? `0${value}` : value))
				.join(':');

			const date = dayjs(`${correctFormatedDate} ${correctFormatedTime}`).toDate();

			const type = typeToRegister !== 'Cargo' ? 'credit' : 'debit';
			const removeSign = type === 'debit' ? amount.replace('-', '') : amount;
			const cleanAmount = parseFloat(
				removeSign.replace('.', '').replace('"', '').replace('"', '').replace('&comma;', '.')
			);

			const res = await BaseTransactions.safeCreateTransaction({
				userId,
				date,
				paymentMethodId: paymentMethod.id,
				categoryId: category?.id,
				currency,
				referenceId,
				description,
				amount: cleanAmount,
				type,
			});
			results.push(res.transaction);
		}

		return results;
	}
}

export const PayPal = new PaypalModule();
