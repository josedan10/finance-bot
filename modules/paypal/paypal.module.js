import dayjs from 'dayjs';
import { PAYMENT_METHODS } from '../../src/enums/paymentMethods.js';
import excelModule from '../excel/excel.module.js';
import prisma from '../database/database.module.js';

export class PaypalModule {
	constructor() {
		this.name = 'Paypal';
		this.columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'M', 'P', 'AL', 'AM', 'AO'];
		this.columnIndexes = this.columnNames.map((columnName) => this.getColumnIndex(columnName));
		this.numberOfColumns = 41;
		this._prisma = prisma;
	}

	// Función para calcular el índice de una columna de Excel basado en su nombre
	getColumnIndex(columnName) {
		let index = 0;
		for (let i = 0; i < columnName.length; i++) {
			const charCode = columnName.charCodeAt(i) - 65; // obtener el valor numérico de la letra - 1
			index += charCode + 26 * i; // sumar el valor numérico de la letra multiplicado por 26 elevado a la posición de la letra en el nombre de la columna
		}

		return index;
	}

	getDataFromCSVData(csvData) {
		const withoutEmptyRows = csvData?.filter((row) => row?.[0]?.length > 0);
		if (
			!withoutEmptyRows ||
			!withoutEmptyRows.length ||
			withoutEmptyRows.some((row) => row.length < this.numberOfColumns)
		)
			return [];
		// Crear una matriz para almacenar los valores extraídos
		const extractedValues = [];

		// Iterar sobre las filas y extraer los valores de las columnas correspondientes a los índices especificados
		withoutEmptyRows.forEach((row) => {
			const extractedRow = [];
			this.columnIndexes.forEach((index) => {
				extractedRow.push(row[index]);
			});
			extractedValues.push(extractedRow);
		});

		return extractedValues;
	}

	async registerPaypalDataFromCSVData(csvData) {
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
				keywords: true,
			},
		});

		console.log(`Registering ${paypalData.length} transactions`);

		const paypalTransactions = paypalData.map((transaction) => {
			// Fecha	Hora	Zona horaria	Nombre	Tipo	Estado	Divisa	Neto	Id. de transacción	Nombre del artículo	Asunto	Nota	Repercusiones en el saldo
			const [
				ppDate,
				time,
				// eslint-disable-next-line no-unused-vars
				timezone,
				name,
				transactionPaypalType,
				// eslint-disable-next-line no-unused-vars
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
			const category = categories.find((cat) => {
				return cat.keywords?.split(',')?.some((keyword) => {
					return description.toLowerCase().includes(keyword.toLowerCase());
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
