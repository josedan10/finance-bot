import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import dayjs from 'dayjs';
import { redisClient } from '../lib/redis';
import { config } from '../config';
import logger from '../lib/logger';

const USD_BASE_CURRENCY = 'USD';
const ARS_QUOTE_CURRENCY = 'ARS';
const ARGENTINA_DATOS_SOURCE = 'argentinadatos';
const VALID_ARGENTINA_DOLLAR_HOUSES = new Set([
	'oficial',
	'blue',
	'bolsa',
	'contadoconliqui',
	'cripto',
	'mayorista',
	'solidario',
	'turista',
]);

type ArgentinaDatosHistoricalDollarQuote = {
	moneda: string;
	casa: string;
	fecha: string;
	compra: number;
	venta: number;
};

function normalizeCalendarDate(date?: string | Date): dayjs.Dayjs {
	return dayjs(date ?? new Date()).startOf('day');
}

export function normalizeArsUsdExchangeHouse(value?: string): string {
	const normalized = value?.trim().toLowerCase() || 'blue';
	return VALID_ARGENTINA_DOLLAR_HOUSES.has(normalized) ? normalized : 'blue';
}

function getHistoricalExchangeRateCacheKey(quoteCurrency: string, sourceKey: string, date: string): string {
	return `historical_exchange_rate:${USD_BASE_CURRENCY}:${quoteCurrency}:${sourceKey}:${date}`;
}

export async function searchHistoricalExchangeRateByDate(
	quoteCurrency: string,
	date?: string | Date,
	sourceKey?: string
) {
	const normalizedDate = normalizeCalendarDate(date);
	const normalizedSourceKey = normalizeArsUsdExchangeHouse(sourceKey);
	const cacheKey = getHistoricalExchangeRateCacheKey(
		quoteCurrency.toUpperCase(),
		normalizedSourceKey,
		normalizedDate.format('YYYY-MM-DD')
	);
	const cachedRate = await redisClient.get(cacheKey);

	if (cachedRate) {
		return JSON.parse(cachedRate);
	}

	const rate = await prisma.historicalExchangeRate.findFirst({
		where: {
			baseCurrency: USD_BASE_CURRENCY,
			quoteCurrency: quoteCurrency.toUpperCase(),
			sourceKey: normalizedSourceKey,
			rateDate: {
				gte: normalizedDate.toDate(),
				lte: normalizedDate.endOf('day').toDate(),
			},
		},
		orderBy: {
			rateDate: 'desc',
		},
	});

	if (rate) {
		await redisClient.set(cacheKey, JSON.stringify(rate), { EX: 43200 });
	}

	return rate;
}

async function persistHistoricalExchangeRate(args: {
	quoteCurrency: string;
	source: string;
	sourceKey: string;
	date: string | Date;
	buyPrice?: number | null;
	sellPrice?: number | null;
}) {
	const normalizedDate = normalizeCalendarDate(args.date);
	const payload = {
		baseCurrency: USD_BASE_CURRENCY,
		quoteCurrency: args.quoteCurrency.toUpperCase(),
		source: args.source,
		sourceKey: args.sourceKey,
		rateDate: normalizedDate.toDate(),
		buyPrice: args.buyPrice ?? null,
		sellPrice: args.sellPrice ?? null,
	};

	const storedRate = await prisma.historicalExchangeRate.upsert({
		where: {
			baseCurrency_quoteCurrency_source_sourceKey_rateDate: {
				baseCurrency: payload.baseCurrency,
				quoteCurrency: payload.quoteCurrency,
				source: payload.source,
				sourceKey: payload.sourceKey,
				rateDate: payload.rateDate,
			},
		},
		create: payload,
		update: payload,
	});

	const cacheKey = getHistoricalExchangeRateCacheKey(
		payload.quoteCurrency,
		payload.sourceKey,
		normalizedDate.format('YYYY-MM-DD')
	);
	await redisClient.set(cacheKey, JSON.stringify(storedRate), { EX: 43200 });

	return storedRate;
}

export async function fetchAndStoreArsUsdRateByDate(date?: string | Date, preferredHouse?: string) {
	const normalizedDate = normalizeCalendarDate(date);
	const house = normalizeArsUsdExchangeHouse(preferredHouse ?? config.ARS_USD_EXCHANGE_HOUSE);
	const requestDate = normalizedDate.format('YYYY/MM/DD');

	try {
		const response = await axios.get<ArgentinaDatosHistoricalDollarQuote>(
			`${config.ARGENTINA_DATOS_API_URL}/v1/cotizaciones/dolares/${house}/${requestDate}`,
			{
				timeout: 5000,
			}
		);

		const quote = response.data;
		const quoteDate = normalizeCalendarDate(quote.fecha);

		return persistHistoricalExchangeRate({
			quoteCurrency: ARS_QUOTE_CURRENCY,
			source: ARGENTINA_DATOS_SOURCE,
			sourceKey: house,
			date: quoteDate.toDate(),
			buyPrice: Number.isFinite(Number(quote.compra)) ? Number(quote.compra) : null,
			sellPrice: Number.isFinite(Number(quote.venta)) ? Number(quote.venta) : null,
		});
	} catch (error) {
		logger.warn('Failed to fetch ARS/USD historical rate from ArgentinaDatos', {
			error,
			requestDate,
			house,
		});
		throw error;
	}
}

export async function getArsUsdRateByDate(date?: string | Date, preferredHouse?: string) {
	const normalizedDate = normalizeCalendarDate(date);
	const house = normalizeArsUsdExchangeHouse(preferredHouse ?? config.ARS_USD_EXCHANGE_HOUSE);
	const cachedRate = await searchHistoricalExchangeRateByDate(ARS_QUOTE_CURRENCY, normalizedDate.toDate(), house);

	if (cachedRate) {
		return cachedRate;
	}

	for (let offset = 0; offset < 7; offset += 1) {
		const fallbackDate = normalizedDate.subtract(offset, 'day');
		try {
			return await fetchAndStoreArsUsdRateByDate(fallbackDate.toDate(), house);
		} catch (error) {
			const status = (error as { response?: { status?: number } } | null)?.response?.status;
			if (status === 404) {
				continue;
			}
			throw error;
		}
	}

	return null;
}

export async function searchRateByDate(date?: string) {
	let searchDate;

	if (!date) {
		searchDate = dayjs().toISOString();
	} else {
		searchDate = dayjs(date).toISOString();
	}

	const cacheKey = `exchange_rate:${searchDate}`;
	const cachedRate = await redisClient.get(cacheKey);

	if (cachedRate) {
		return JSON.parse(cachedRate);
	}

	const rate = await prisma.dailyExchangeRate.findFirst({
		where: {
			date: {
				lte: searchDate,
			},
		},
		orderBy: {
			date: 'desc',
		},
	});

	if (rate) {
		// Cache for 12 hours
		await redisClient.set(cacheKey, JSON.stringify(rate), { EX: 43200 });
	}

	return rate;
}

export function calculateUSDAmountByRate(originalCurrencyAmount: number | Decimal, bcvPrice: number | Decimal) {
	const originalCurrNumber = Number(originalCurrencyAmount);
	const bcvPriceNumber = Number(bcvPrice);

	if (bcvPriceNumber <= 0) {
		throw new Error(`Invalid BCV price: ${bcvPriceNumber}. Must be a positive number.`);
	}

	return Number((originalCurrNumber / bcvPriceNumber).toFixed(2));
}
