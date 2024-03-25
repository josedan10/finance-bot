import { Decimal } from '@prisma/client/runtime/library';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import dayjs from 'dayjs';

/**
 * @description
 *
 * @param date String YYYY-MM-DD
 *
 * @returns Prisma.DailyExchangeRate
 */
export async function searchRateByDate(date?: string) {
	let searchDate;

	if (!date) {
		searchDate = dayjs().toISOString();
	} else {
		searchDate = dayjs(date).toISOString();
	}

	return prisma.dailyExchangeRate.findFirst({
		where: {
			date: {
				lte: searchDate,
			},
		},
		orderBy: {
			date: 'desc',
		},
	});
}

export function calculateUSDAmountByRate(originalCurrencyAmount: number | Decimal, bcvPrice: number | Decimal) {
	const originalCurrNumber = Number(originalCurrencyAmount);
	const bcvPriceNumber = Number(bcvPrice);
	return Number((originalCurrNumber / bcvPriceNumber).toFixed(2));
}
