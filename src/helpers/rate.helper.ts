import { Decimal } from '@prisma/client/runtime/library';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import dayjs from 'dayjs';
import { redisClient } from '../lib/redis';

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
		await redisClient.set(cacheKey, JSON.stringify(rate), 43200);
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
