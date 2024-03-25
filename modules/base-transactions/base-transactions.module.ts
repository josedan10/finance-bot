import dayjs from 'dayjs';
import { PrismaModule } from '../database/database.module';
import { extractTransactionDetails } from '../../src/helpers/price.helper';
import { ExchangeCurrencyCronServices } from '../crons/exchange-currency/exchange-currency.service';
import { calculateUSDAmountByRate } from '../../src/helpers/rate.helper';
import { Category, PrismaClient, Transaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

class BaseTransactionsModule {
	private _db: PrismaClient;
	constructor() {
		this._db = PrismaModule;
	}

	/**
	 * We need to apply this if statement because we want to register the amount on dollars at it's corresponding date
	 * with the exchange currency, we also want to evaluate if it is weekend because we want to use the friday exchange rate
	 * and we also want to evaluate if the transaction date is from present because we need first to verifiy if the exchange
	 * rate was modified with the present rate, that happens on a certain hours, and so on we leave the amount at null, that will
	 * be updated at the next day with a cronjob that runs once per day.
	 */
	async _VESToUSDWithExchangeRateByDate(date: string, amount: number | Decimal) {
		const currentHour = dayjs().hour();
		const rateIsNotAvailable = currentHour < 9 || currentHour >= 11;
		const currentDay = dayjs().format('YYYY-MM-DD');
		const currentDayIsNotEqualToTransactionDate = currentDay !== date;
		const isWeekend = dayjs().day() === 6 || dayjs().day() === 0;

		const exchangeManualRateMatch = await ExchangeCurrencyCronServices.getLatestExchangeCurrency(date);

		if ((currentDayIsNotEqualToTransactionDate || isWeekend || rateIsNotAvailable) && exchangeManualRateMatch) {
			return calculateUSDAmountByRate(Number(amount), exchangeManualRateMatch);
		}

		return null;
	}

	/**
	 * @description
	 * Process a manual transaction of any type of method
	 *
	 * @param {array} data splitted data from the command by spaces
	 * @returns {object} transaction created
	 */
	async registerManualTransactions(data: string[]) {
		const joinedData = data.join(' ');
		const splittedData = joinedData.split(';');

		const amount = splittedData.find((d) => d.includes('amount='))?.split('=')?.[1];
		const description = splittedData.find((d) => d.includes('desc='))?.split('=')?.[1];
		const paymentMethodName = splittedData.find((d) => d.includes('method='))?.split('=')?.[1];
		const type = splittedData.find((d) => d.includes('type='))?.split('=')?.[1];
		const categoryName = splittedData.find((d) => d.includes('cat='))?.split('=')?.[1];
		const currency = splittedData.find((d) => d.includes('currency='))?.split('=')?.[1];
		const date = splittedData.find((d) => d.includes('date='))?.split('=')?.[1] || dayjs().toISOString();

		let amountInUSD;

		if (!amount || !description || !paymentMethodName || !type || !categoryName) {
			const sampleData =
				'amount=100; desc=My description; method=Mercantil Venezuela; type=debit; cat=CATEGORY_NAME; currency=VES; date=2021-01-01';
			throw new Error(`Invalid data: ${data}... Try with ${sampleData}`);
		}

		if (currency && currency === 'VES') {
			amountInUSD = await this._VESToUSDWithExchangeRateByDate(date, Number(amount));
		} else {
			amountInUSD = Number(amount);
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
				amount: amountInUSD,
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
	 * @param {Array} telegramFileIds array of file_ids from telegram
	 * @param {Array} args array of arguments from the command ex: ['amount=100', 'desc=My description']
	 * @returns {Object} transaction created
	 */
	async registerTransactionFromImages(
		data: string[],
		telegramFileIds: string[],
		args?: string[]
	): Promise<{
		transaction: Transaction;
		category: Category | null;
	}> {
		let amount;
		let category: Category | null = null;
		let date = dayjs().format('YYYY-MM-DD');

		if (args && args.length > 0) {
			amount = args?.find((arg) => arg.includes('amount'))?.split('=')?.[1];
		}

		if (!amount) {
			const transactionDetails = extractTransactionDetails(data);
			date = transactionDetails?.date || date;
			amount = transactionDetails?.amount;
		}
		// Convert to USD using the current exchange rate

		if (!amount) {
			throw new Error('Amount not found');
		}

		const amountInUSD = amount && date ? await this._VESToUSDWithExchangeRateByDate(date, Number(amount)) : null;

		// Transform the line array into a words array
		const words = data.join(' ').replaceAll('\n', ' ').split(' ');

		for (const word of words) {
			category = await this._db.category.findFirst({
				where: {
					categoryKeyword: {
						some: {
							keyword: {
								name: word.toLowerCase(),
							},
						},
					},
				},
			});

			if (category) {
				console.log(`Category found: ${category.name} with keyword: ${word}`);
				break;
			}
		}

		const transaction = await this._db.transaction.create({
			data: {
				...(amountInUSD ? { amount: amountInUSD } : {}),
				originalCurrencyAmount: Number(amount),
				description: words.join(' ').slice(0, 100),
				type: 'debit',
				date: date ? dayjs(date).toDate() : dayjs().toDate(),
				currency: 'VES',
				telegramFileIds: telegramFileIds.join(','),
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

		console.log('category', category);

		return { transaction, category };
	}
}

export const BaseTransactions = new BaseTransactionsModule();
