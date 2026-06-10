import dayjs from 'dayjs';
import { PrismaModule } from '../database/database.module';
import { extractTransactionDetails } from '../../src/helpers/price.helper';
import { ExchangeCurrencyCronServices } from '../crons/exchange-currency/exchange-currency.service';
import { calculateUSDAmountByRate, getArsUsdRateByDate } from '../../src/helpers/rate.helper';
import { Category, PaymentMethod, Prisma, PrismaClient, Transaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';
import { redisClient } from '../../src/lib/redis';
import { NotificationFactory } from '../notifications/notification.module';

type TransactionWithRelations = Prisma.TransactionGetPayload<{
	include: {
		category: true;
		paymentMethod: true;
	};
}>;

type TransactionWithOptionalRelations = Transaction & {
	category: Category | null;
	paymentMethod: PaymentMethod | null;
};

type SafeCreateTransactionInput = Prisma.TransactionUncheckedCreateInput & {
	userId: number;
	amount: number | Decimal;
	date: Date | string;
	type: string;
	currency: string;
	description?: string | null;
	referenceId?: string | null;
	originalCurrencyAmount?: number | Decimal | null;
	exchangeRateOverride?: number | Decimal | null;
	amountIsAlreadyNormalized?: boolean;
	skipDuplicateCheck?: boolean;
};

type SafeCreateTransactionResult = {
	transaction: TransactionWithOptionalRelations;
	isDuplicate: boolean;
};

type DuplicateLookupInput = {
	userId: number;
	amount: number | Decimal;
	date: Date;
	type: string;
	currency: string;
	description?: string;
	referenceId?: string;
};

export function mapTransactionType(type: unknown): 'credit' | 'debit' | null {
	if (typeof type !== 'string') {
		return null;
	}

	switch (type.trim()) {
		case 'income':
		case 'credit':
			return 'credit';
		case 'expense':
		case 'debit':
			return 'debit';
		default:
			return null;
	}
}

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
		const exchangeManualRateMatch = await ExchangeCurrencyCronServices.getLatestExchangeCurrency(date);

		if (exchangeManualRateMatch) {
			return calculateUSDAmountByRate(Number(amount), exchangeManualRateMatch);
		}

		return null;
	}

	async _ARSToUSDWithExchangeRateByDate(date: string, amount: number | Decimal) {
		const exchangeRate = await getArsUsdRateByDate(date);
		const sellPrice = exchangeRate?.sellPrice;

		if (sellPrice === undefined || sellPrice === null) {
			return null;
		}

		return calculateUSDAmountByRate(Number(amount), sellPrice);
	}

	async normalizeTransactionAmount(args: {
		amount: number | Decimal;
		currency: string;
		date: Date | string;
		originalCurrencyAmount?: number | Decimal | null;
		exchangeRateOverride?: number | Decimal | null;
		amountIsAlreadyNormalized?: boolean;
	}) {
		const transactionDate = args.date instanceof Date ? args.date : new Date(args.date);
		const currency = args.currency.trim().toUpperCase();
		let finalAmount = Number(args.amount);
		let originalCurrencyAmount =
			args.originalCurrencyAmount ?? (currency !== 'USD' ? Number(args.amount) : null);
		let exchangeRateUsed: number | null = null;
		let exchangeRateSource: string | null = null;
		let exchangeRateSourceKey: string | null = null;

		const overrideRate = args.exchangeRateOverride === null || args.exchangeRateOverride === undefined
			? null
			: Number(args.exchangeRateOverride);

		if (overrideRate !== null && Number.isFinite(overrideRate) && overrideRate > 0 && currency !== 'USD') {
			finalAmount = calculateUSDAmountByRate(Number(args.amount), overrideRate);
			exchangeRateUsed = overrideRate;
			exchangeRateSource = 'manual';
			exchangeRateSourceKey = 'transaction_override';
			return {
				amount: finalAmount,
				originalCurrencyAmount,
				currency,
				exchangeRateUsed,
				exchangeRateSource,
				exchangeRateSourceKey,
			};
		}

		if (currency === 'VES' && !args.amountIsAlreadyNormalized) {
			const converted = await this._VESToUSDWithExchangeRateByDate(
				dayjs(transactionDate).format('YYYY-MM-DD'),
				Number(args.amount)
			);
			if (converted !== null) {
				finalAmount = converted;
				originalCurrencyAmount = Number(args.amount);
				const latestExchange = await ExchangeCurrencyCronServices.getLatestExchangeCurrency(
					dayjs(transactionDate).format('YYYY-MM-DD')
				);
				const normalizedVesRate =
					latestExchange === null || latestExchange === undefined ? null : Number(latestExchange);
				exchangeRateUsed = normalizedVesRate !== null && Number.isFinite(normalizedVesRate) ? normalizedVesRate : null;
				exchangeRateSource = exchangeRateUsed !== null ? 'pydolar' : null;
				exchangeRateSourceKey = exchangeRateUsed !== null ? 'bcv' : null;
			}
		} else if (currency === 'ARS' && !args.amountIsAlreadyNormalized) {
			const historicalRate = await getArsUsdRateByDate(dayjs(transactionDate).format('YYYY-MM-DD'));
			const converted =
				historicalRate?.sellPrice === null || historicalRate?.sellPrice === undefined
					? null
					: calculateUSDAmountByRate(Number(args.amount), historicalRate.sellPrice);
			if (converted !== null) {
				finalAmount = converted;
				originalCurrencyAmount = Number(args.amount);
				const normalizedSellPrice = Number(historicalRate.sellPrice);
				exchangeRateUsed = Number.isFinite(normalizedSellPrice) ? normalizedSellPrice : null;
				exchangeRateSource = historicalRate?.source ?? null;
				exchangeRateSourceKey = historicalRate?.sourceKey ?? null;
			}
		} else if (currency === 'USD') {
			finalAmount = Number(args.amount);
			if (!originalCurrencyAmount) {
				originalCurrencyAmount = finalAmount;
			}
		}

		return {
			amount: finalAmount,
			originalCurrencyAmount,
			currency,
			exchangeRateUsed,
			exchangeRateSource,
			exchangeRateSourceKey,
		};
	}

	async getSystemExchangeRatePreview(currency: string, date: Date | string) {
		const normalizedCurrency = currency.trim().toUpperCase();
		const transactionDate = date instanceof Date ? date : new Date(date);
		if (normalizedCurrency === 'ARS') {
			return getArsUsdRateByDate(dayjs(transactionDate).format('YYYY-MM-DD'));
		}
		if (normalizedCurrency === 'VES') {
			const latestExchange = await ExchangeCurrencyCronServices.getLatestExchangeCurrency(
				dayjs(transactionDate).format('YYYY-MM-DD'),
			);
			if (latestExchange === null || latestExchange === undefined) {
				return null;
			}
			return {
				sellPrice: latestExchange,
				buyPrice: latestExchange,
				source: 'pydolar',
				sourceKey: 'bcv',
			};
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

		if (!amount || !description || !paymentMethodName || !type || !categoryName) {
			const sampleData =
				'amount=100; desc=My description; method=Mercantil Venezuela; type=debit; cat=CATEGORY_NAME; currency=VES; date=2021-01-01';
			throw new Error(`Invalid data: ${data}... Try with ${sampleData}`);
		}

		const normalizedType = mapTransactionType(type);
		if (!normalizedType) {
			throw new Error(`Invalid transaction type: ${type}`);
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
				await redisClient.set(pmCacheKey, JSON.stringify(paymentMethod), { EX: 3600 }); // 1 hour
			}
		}

		if (!paymentMethod) {
			throw new Error(`Payment method ${paymentMethodName} not found`);
		}

		const catCacheKey = `category:${userId}:${categoryName}`;
		let category: Category | null;
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
				await redisClient.set(catCacheKey, JSON.stringify(category), { EX: 3600 }); // 1 hour
			}
		}

		if (!category) {
			throw new Error(`Category ${categoryName} not found`);
		}

		const { transaction } = await this.safeCreateTransaction({
			userId,
			amount: Number(amount),
			description,
			type: normalizedType,
			date: date ? dayjs(date).toDate() : dayjs().toDate(),
			currency: currency || 'USD',
			paymentMethodId: paymentMethod.id,
			categoryId: category.id,
		});

		// Check budget thresholds and send notifications (async, non-blocking)
		if (type === 'expense' || type === 'debit') {
			NotificationFactory.notifyBudgetThreshold(userId, category.id, Number(transaction.amount)).catch((error) => {
				logger.error('Failed to check budget notifications', {
					error: error instanceof Error ? error.message : 'Unknown error',
					userId,
					categoryId: category.id,
				});
			});
		}

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
				await redisClient.set(keywordCacheKey, JSON.stringify(category), { EX: 3600 * 24 }); // 24 hours
				return category;
			}
		}

		return null;
	}

	/**
	 * Looks for a potential duplicate transaction.
	 * A transaction is considered a duplicate if it has:
	 * 1. Matching referenceId (High confidence)
	 * 2. Same userId + normalized amount + currency + date within a 48-hour window (+/- 1 day) + matching description keywords (Fuzzy)
	 */
	private normalizeDescription(description: string): string[] {
		return description
			.toLowerCase()
			.replace(/[^a-z0-9 ]/g, '')
			.split(' ')
			.filter((word) => word.length >= 2);
	}

	private isDuplicateCandidate(
		data: DuplicateLookupInput,
		candidate: TransactionWithOptionalRelations
	): boolean {
		const { amount, description } = data;

		if (Number(candidate.amount) !== Number(amount)) return false;

		if (!description) return true;
		if (!candidate.description) return false;

		const newKeywords = this.normalizeDescription(description);
		const candidateKeywords = this.normalizeDescription(candidate.description);
		const overlap = newKeywords.filter((word) => candidateKeywords.includes(word));

		return (
			overlap.length >= 2 ||
			(overlap.length >= 1 && (newKeywords.length <= 2 || candidateKeywords.length <= 2)) ||
			description.toLowerCase().includes(candidate.description.toLowerCase()) ||
			candidate.description.toLowerCase().includes(description.toLowerCase())
		);
	}

	findDuplicateInCandidates(
		data: DuplicateLookupInput,
		candidates: TransactionWithRelations[]
	): TransactionWithRelations | null {
		const { referenceId } = data;

		if (referenceId) {
			const referenceMatch = candidates.find((candidate) => candidate.referenceId === referenceId);
			if (referenceMatch) return referenceMatch;
		}

		return candidates.find((candidate) => this.isDuplicateCandidate(data, candidate)) ?? null;
	}

	async findDuplicate(data: DuplicateLookupInput): Promise<TransactionWithRelations | null> {
		const { userId, amount, date, type, currency, referenceId } = data;
		const normalizedAmount = amount instanceof Decimal ? amount : new Decimal(amount);

		// 1. Priority: Exact referenceId match
		if (referenceId) {
			const refMatch = await this._db.transaction.findFirst({
				where: {
					userId,
					referenceId,
				},
				include: {
					category: true,
					paymentMethod: true,
				},
			});
			if (refMatch) return refMatch;
		}

		// 2. Fuzzy: Amount + Currency + Date Window + Description Similarity
		const startDate = dayjs(date).subtract(1, 'day').toDate();
		const endDate = dayjs(date).add(1, 'day').toDate();

		const potentialDuplicates = (await this._db.transaction.findMany({
			where: {
				userId,
				amount: normalizedAmount,
				currency,
				type,
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		})) ?? [];

		if (potentialDuplicates.length === 0) return null;

		return this.findDuplicateInCandidates(data, potentialDuplicates);
	}

	/**
	 * Creates a transaction only if it's not a duplicate.
	 * Handles internal VES -> USD normalization if needed.
	 */
	async safeCreateTransaction(data: SafeCreateTransactionInput): Promise<SafeCreateTransactionResult> {
		const { amount, currency, date } = data;
		const transactionDate = date instanceof Date ? date : new Date(date);
		const normalizedAmounts = await this.normalizeTransactionAmount({
			amount,
			currency,
			date: transactionDate,
			originalCurrencyAmount: data.originalCurrencyAmount,
			exchangeRateOverride: data.exchangeRateOverride,
			amountIsAlreadyNormalized: data.amountIsAlreadyNormalized,
		});
		const finalAmount = normalizedAmounts.amount;
		const originalCurrencyAmount = normalizedAmounts.originalCurrencyAmount;
		const normalizedCurrency = normalizedAmounts.currency;

		if (!data.skipDuplicateCheck) {
			const duplicate = await this.findDuplicate({
				userId: data.userId,
				amount: finalAmount,
				date: transactionDate,
				type: data.type,
				currency: normalizedCurrency || 'USD',
				description: data.description ?? undefined,
				referenceId: data.referenceId ?? undefined,
			});

			if (duplicate) {
				logger.info('Duplicate transaction detected, skipping creation', {
					originalId: duplicate.id,
					userId: data.userId,
					amount: finalAmount,
					currency: normalizedCurrency,
					date: transactionDate,
				});
				return { transaction: duplicate, isDuplicate: true };
			}
		}

		const { amountIsAlreadyNormalized: _amountIsAlreadyNormalized, skipDuplicateCheck: _skipDuplicateCheck, ...transactionData } = data;
		const transaction = await this._db.transaction.create({
			data: {
				...transactionData,
				date: transactionDate,
				amount: finalAmount,
				currency: normalizedCurrency,
				originalCurrencyAmount,
				exchangeRateUsed: normalizedAmounts.exchangeRateUsed,
				exchangeRateSource: normalizedAmounts.exchangeRateSource,
				exchangeRateSourceKey: normalizedAmounts.exchangeRateSourceKey,
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		});

		return { transaction, isDuplicate: false };
	}

	/**
	 * Parses extracted text into structured transaction data without persisting it.
	 */
	async parseTransactionFromText(textLines: string[], userId: number) {
		const transactionDetails = extractTransactionDetails(textLines);
		const date = transactionDetails?.date || dayjs().format('YYYY-MM-DD');
		const amount = transactionDetails?.amount;

		if (!amount) {
			throw new Error('Amount not found');
		}

		const amountInUSD = amount && date ? await this._VESToUSDWithExchangeRateByDate(date, Number(amount)) : null;
		const words = textLines.join(' ').replaceAll('\n', ' ').split(' ');
		const category = await this.findCategoryByWords(words, userId);

		return {
			date,
			amount: amountInUSD || Number(amount),
			originalAmount: Number(amount),
			currency: amountInUSD ? 'USD' : 'VES',
			description: words.join(' ').slice(0, config.MAX_DESCRIPTION_LENGTH),
			category: category?.name || 'Other',
			categoryId: category?.id,
			type: 'debit' as const,
		};
	}

	async registerTransactionFromImages(
		data: string[],
		telegramFileIds: string[],
		args: string[] | undefined,
		userId: number
	): Promise<{
		transaction: TransactionWithOptionalRelations;
		category: Category | null;
	}> {
		let amount: string | undefined;

		if (args && args.length > 0) {
			amount = args?.find((arg) => arg.includes('amount'))?.split('=')?.[1];
		}

		const parsed = await this.parseTransactionFromText(data, userId);
		
		// If amount was forced by args, override
		const finalAmount = amount ? Number(amount) : parsed.amount;
		const finalDate = parsed.date;

		const { transaction } = await this.safeCreateTransaction({
			userId,
			amount: finalAmount,
			originalCurrencyAmount: parsed.originalAmount,
			description: parsed.description,
			type: 'debit',
			date: dayjs(finalDate).toDate(),
			currency: parsed.currency,
			telegramFileIds: telegramFileIds.join(','),
			categoryId: parsed.categoryId,
		});

		// Check budget thresholds and send notifications (async, non-blocking)
		if (transaction.categoryId) {
			NotificationFactory.notifyBudgetThreshold(userId, transaction.categoryId, Number(finalAmount)).catch((error) => {
				logger.error('Failed to check budget notifications', {
					error: error instanceof Error ? error.message : 'Unknown error',
					userId,
					categoryId: transaction.categoryId,
				});
			});
		}

		return { transaction, category: transaction.category ?? null };
	}
}

export const BaseTransactions = new BaseTransactionsModule();
