import dayjs from 'dayjs';
import { PrismaModule } from '../database/database.module';
import { extractTransactionDetails } from '../../src/helpers/price.helper';
import { ExchangeCurrencyCronServices } from '../crons/exchange-currency/exchange-currency.service';
import { calculateUSDAmountByRate } from '../../src/helpers/rate.helper';
import { Category, PrismaClient, Transaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';
import { redisClient } from '../../src/lib/redis';

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
		const rateIsNotAvailable =
			currentHour < config.RATE_AVAILABLE_START_HOUR || currentHour >= config.RATE_AVAILABLE_END_HOUR;
		const currentDay = dayjs().format('YYYY-MM-DD');
		const currentDayIsNotEqualToTransactionDate = currentDay !== date;
		const isWeekend = dayjs().day() === 6 || dayjs().day() === 0;

		const exchangeManualRateMatch = await ExchangeCurrencyCronServices.getLatestExchangeCurrency(date);

		if ((currentDayIsNotEqualToTransactionDate || isWeekend || rateIsNotAvailable) && exchangeManualRateMatch) {
			return calculateUSDAmountByRate(Number(amount), exchangeManualRateMatch);
		}

		return null;
	}

	async registerManualTransactions(data: string[], userId: number) {
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

		const pmCacheKey = `payment_method:${userId}:${paymentMethodName}`;
		let paymentMethod;
		const cachedPm = await redisClient.get(pmCacheKey);

		if (cachedPm) {
			paymentMethod = JSON.parse(cachedPm);
		} else {
			paymentMethod = await this._db.paymentMethod.findFirst({
				where: {
					name: paymentMethodName,
					userId,
				},
			});

			if (paymentMethod) {
				await redisClient.set(pmCacheKey, JSON.stringify(paymentMethod), 3600); // 1 hour
			}
		}

		if (!paymentMethod) {
			throw new Error(`Payment method ${paymentMethodName} not found`);
		}

		const catCacheKey = `category:${userId}:${categoryName}`;
		let category;
		const cachedCat = await redisClient.get(catCacheKey);

		if (cachedCat) {
			category = JSON.parse(cachedCat);
		} else {
			category = await this._db.category.findFirst({
				where: {
					name: categoryName,
					userId,
				},
			});

			if (category) {
				await redisClient.set(catCacheKey, JSON.stringify(category), 3600); // 1 hour
			}
		}

		if (!category) {
			throw new Error(`Category ${categoryName} not found`);
		}

		const transaction = await this._db.transaction.create({
			data: {
				user: { connect: { id: userId } },
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

	private async findCategoryByWords(words: string[], userId: number): Promise<Category | null> {
		const lowerWords = words.map((w) => w.toLowerCase()).filter((w) => w.length > 0);
		if (lowerWords.length === 0) return null;

		const keywordHash = Buffer.from(lowerWords.join('_')).toString('base64');
		const keywordCacheKey = `category_keywords:${userId}:${keywordHash}`;

		const cachedCategoryStr = await redisClient.get(keywordCacheKey);
		if (cachedCategoryStr) {
			const cachedCategory = JSON.parse(cachedCategoryStr);
			logger.info(`Category found from cache: ${cachedCategory.name}`);
			return cachedCategory;
		}

		const keywords = await this._db.keyword.findMany({
			where: {
				name: { in: lowerWords },
				userId,
			},
			select: {
				name: true,
				categoryKeyword: {
					select: {
						category: true,
					},
					take: 1,
				},
			},
		});

		for (const keyword of keywords) {
			if (keyword.categoryKeyword.length > 0) {
				const category = keyword.categoryKeyword[0].category;
				logger.info(`Category found: ${category.name} with keyword: ${keyword.name}`);
				await redisClient.set(keywordCacheKey, JSON.stringify(category), 3600 * 24); // 24 hours
				return category;
			}
		}

		return null;
	}

	async registerTransactionFromImages(
		data: string[],
		telegramFileIds: string[],
		args: string[] | undefined,
		userId: number
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

		if (!amount) {
			throw new Error('Amount not found');
		}

		const amountInUSD = amount && date ? await this._VESToUSDWithExchangeRateByDate(date, Number(amount)) : null;

		const words = data.join(' ').replaceAll('\n', ' ').split(' ');

		category = await this.findCategoryByWords(words, userId);

		const transaction = await this._db.transaction.create({
			data: {
				user: { connect: { id: userId } },
				...(amountInUSD ? { amount: amountInUSD } : {}),
				originalCurrencyAmount: Number(amount),
				description: words.join(' ').slice(0, config.MAX_DESCRIPTION_LENGTH),
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

		return { transaction, category };
	}
}

export const BaseTransactions = new BaseTransactionsModule();
