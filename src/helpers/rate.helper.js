import prisma from '../../modules/database/database.module.js';
import dayjs from 'dayjs';

/**
 * @description
 *
 * @param date String YYYY-MM-DD
 *
 * @returns Prisma.DailyExchangeRate
 */
export async function searchRateByDate(date = undefined) {
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

export function calculateUSDAmountByRate(originalCurrencyAmount, bcvPrice) {
	return Number((originalCurrencyAmount / bcvPrice).toFixed(2));
}
