import dayjs from 'dayjs';
import prisma from '../database/database.module.js';

class ManualTransactions {
	constructor() {
		this._db = prisma;
	}

	/**
	 * @description
	 * Process a manual transaction of any type of method
	 *
	 * @param {array} data splitted data from the command by spaces
	 * @returns {object} transaction created
	 */
	async registerManualTransaction(data) {
		const joinedData = data.join(' ');
		const splittedData = joinedData.split(';');

		const amount = splittedData.find((d) => d.includes('amount='))?.split('=')?.[1];
		const description = splittedData.find((d) => d.includes('desc='))?.split('=')?.[1];
		const paymentMethodName = splittedData.find((d) => d.includes('method='))?.split('=')?.[1];
		const type = splittedData.find((d) => d.includes('type='))?.split('=')?.[1];
		const categoryName = splittedData.find((d) => d.includes('cat='))?.split('=')?.[1];
		const currency = splittedData.find((d) => d.includes('currency='))?.split('=')?.[1];
		const date = splittedData.find((d) => d.includes('date='))?.split('=')?.[1] || new Date();

		let amountInUSD;

		if (!amount || !description || !paymentMethodName || !type || !categoryName) {
			const sampleData =
				'amount=100; desc=My description; method=Mercantil Venezuela; type=debit; cat=CATEGORY_NAME; currency=VES; date=2021-01-01';
			throw new Error(`Invalid data: ${data}... Try with ${sampleData}`);
		}

		if (currency && currency === 'VES') {
			// Convert to USD usign the current exchange rate

			// If today is Saturday or Sunday, get the exchange rate from Friday, any other day, get the exchange rate from the current day
			const weekDay = dayjs().day();
			let limitDate;

			if (weekDay === 6) {
				console.log('Saturday');
				limitDate = dayjs(date).subtract(1, 'day').toDate();
			} else if (weekDay === 0) {
				console.log('Sunday');
				limitDate = dayjs(date).subtract(2, 'day').toDate();
			} else {
				console.log('Any other day');
				limitDate = dayjs(date).toDate();
			}

			const exchangeRate = await this._db.dailyExchangeRate.findFirst({
				where: {
					date: {
						gte: limitDate,
					},
				},
			});

			if (!exchangeRate) {
				console.log('No exchange rate found. Cronjob will run to get the exchange rate');
			} else {
				console.log(`Exchange rate found: ${exchangeRate.monitorPrice}`);
				amountInUSD = Number(amount) / Number(exchangeRate.monitorPrice);
				console.log(`Amount in USD: ${amountInUSD}`);
			}
		} else {
			amountInUSD = amount;
		}

		const paymentMethod = await this._db.paymentMethod.findUnique({
			where: {
				name: paymentMethodName,
			},
		});

		if (!paymentMethod) {
			throw new Error(`Payment method ${paymentMethodName} not found`);
		}

		const category = await this._db.category.findUnique({
			where: {
				name: categoryName,
			},
		});

		if (!category) {
			throw new Error(`Category ${categoryName} not found`);
		}

		const transaction = await this._db.transaction.create({
			data: {
				amount: Number(amountInUSD),
				description,
				type,
				date: date ? dayjs(date).toDate() : dayjs().toDate(),
				currency: currency || 'USD',
				originalCurrencyAmount: currency !== 'USD' ? Number(amount) : null,
				paymentMethod: {
					connect: {
						id: paymentMethod.id,
					},
				},
				category: {
					connect: {
						id: category.id,
					},
				},
			},
		});

		return transaction;
	}
}

export const ManualTransaction = new ManualTransactions();
