import dayjs from 'dayjs';
import { PAYMENT_METHODS } from '../../src/enums/paymentMethods';
import excelModule from '../excel/excel.module';
import { PrismaModule as prisma } from '../database/database.module';

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

	// Function to calculate the index of an Excel column based on its name
	getColumnIndex(columnName: string): number {
		let index = 0;
		for (let i = 0; i < columnName.length; i++) {
			const charCode = columnName.charCodeAt(i) - 65; // Get the numerical value of the letter - 1
			index += charCode + 26 * i; // Add the numerical value of the letter multiplied by 26 raised to the position of the letter in the column name
		}
		return index;
	}

	getDataFromCSVData(csvData: string[][]): string[][] {
		const withoutEmptyRows = csvData?.filter((row) => row?.[0]?.length > 0);
		if (!withoutEmptyRows?.length || withoutEmptyRows.some((row) => row.length < this.numberOfColumns)) return [];
		// Create a matrix to store the extracted values
		const extractedValues: string[][] = [];
		// Iterate over the rows and extract the values from the columns corresponding to the specified indexes
		withoutEmptyRows.forEach((row) => {
			const extractedRow: string[] = [];
			this.columnIndexes.forEach((index) => {
				extractedRow.push(row[index]);
			});
			extractedValues.push(extractedRow);
		});
		return extractedValues;
	}

	// TODO: Refactor this function
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async registerPaypalDataFromCSVData(csvData: string): Promise<any[]> {
		const parsedData = excelModule.parseCSVDataToJs(csvData, 1);
		const paypalData = this.getDataFromCSVData(parsedData);

		const paymentMethod = await this._prisma.paymentMethod.findUnique({
			where: {
				name: PAYMENT_METHODS.PAYPAL,
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

		console.log(`Registering ${paypalData.length} transactions`);

		const paypalTransactions = paypalData.map((transaction) => {
			// Date	Time	Timezone	Name	Type	Status	Currency	Net	Id transaction	Item name	Subject	Note	Balance consequences
			const [
				ppDate,
				time,
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				timezone,
				name,
				transactionPaypalType,
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				status,
				currency,
				amount,
				referenceId,
				articleName,
				subject,
				note,
				typeToRegister,
			] = transaction;

			const description = `${articleName} - ${subject} - ${note} / ${transactionPaypalType} (${name})`;
			console.log(categories);
			const category = categories.find((cat) => {
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

			const data = {
				date,
				paymentMethod: {
					connect: {
						id: paymentMethod?.id ?? 0,
					},
				},
				...(category && {
					category: {
						connect: {
							id: category?.id,
						},
					},
				}),
				currency,
				referenceId,
				description,
				amount: cleanAmount,
				type,
			};

			return this._prisma.transaction.create({
				data,
			});
		});

		return this._prisma.$transaction(paypalTransactions);
	}
}

export const PayPal = new PaypalModule();
