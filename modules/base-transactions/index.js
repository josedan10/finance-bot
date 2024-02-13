import dayjs from 'dayjs';
import prisma from '../database/database.module.js';
import { PendingTransactionAssignments } from '../pending-transaction-assignments/pending-transaction-assignments.module.js';

class BaseTransactionsModule {
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
	async registerManualTransactions(data) {
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

	/**
	 * @description
	 * Receives an array of text from images, search for a category and payment method and create a transaction.
	 * If there is no category that can match using the keywords, it will create a task, and a .txt file related to the image text, so the user can manually assign the category later.
	 *
	 * @param {Array} data array of text from images
	 * @returns {Object} transaction created
	 */
	async registerTransactionFromImages(data) {
		if (!data) {
			throw new Error('No data found');
		}
		let category = null;
		let amount;

		const totalLine = data.find((d) => d.toLowerCase().includes('total'));
		// Use a regex to get the amount. The format can be Bs 100.00 or Bs 100 or 100.00 or 100 or 100,000.00 or 100,000 or 100,00
		const amountMatch = totalLine?.match(/(?:Bs\s)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/);

		if (amountMatch && amountMatch[1]) {
			amount = parseFloat(amountMatch[1].replace(/,/g, ''));
		} else {
			throw new Error(`Amount not found in text: ${data.join(' ')}`);
		}

		// Transform the line array into a words array
		const words = data.join(' ').split(' ');

		for (const word of words) {
			category = await this._db.category.findFirst({
				where: {
					keywords: {
						some: {
							name: {
								contains: word,
							},
						},
					},
				},
			});

			if (category) {
				break;
			}
		}

		const transaction = await this._db.transaction.create({
			data: {
				originalCurrencyAmount: Number(amount),
				description: words.join(' ').slice(0, 100),
				type: 'debit',
				date: dayjs().toDate(),
				currency: 'VES',
				...(category
					? {
							category: {
								connect: {
									id: category.id,
								},
							},
					  }
					: {}),
			},
		});

		if (!category) {
			// If there is not category found
			// Create a task and a .txt file
			await PendingTransactionAssignments.createPendingTransactionAssignment(data, transaction.id);
		}

		return transaction;
	}
}

export const BaseTransactions = new BaseTransactionsModule();
