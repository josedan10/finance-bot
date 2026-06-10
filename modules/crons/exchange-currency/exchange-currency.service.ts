import { PrismaModule as prisma } from '../../database/database.module';
import { searchRateByDate, calculateUSDAmountByRate } from '../../../src/helpers/rate.helper';
import { Decimal } from '@prisma/client/runtime/library';
import { Transaction } from '@prisma/client';
import logger from '../../../src/lib/logger';

class ExchangeCurrencyCronService {
	async getTransactionsWithoutAmount(): Promise<Partial<Transaction>[]> {
		return prisma.transaction.findMany({
			where: {
				amount: null,
				currency: 'VES',
			},
			select: {
				originalCurrencyAmount: true,
				id: true,
				date: true,
			},
		});
	}

	async getLatestExchangeCurrency(date?: string): Promise<Decimal | undefined | null> {
		const exchange = await searchRateByDate(date);
		return exchange?.bcvPrice;
	}

	async getAmountResult(): Promise<void> {
		try {
			const transactionsData = await this.getTransactionsWithoutAmount();
			const updatePromises = [];

			for (const transaction of transactionsData) {
				if (!transaction.id || !transaction.originalCurrencyAmount || !transaction.date) {
					continue;
				}

				const bcvPrice = await this.getLatestExchangeCurrency(transaction.date.toISOString());
				if (bcvPrice === undefined || bcvPrice === null) {
					continue;
				}

				updatePromises.push(
					prisma.transaction.update({
						where: { id: transaction.id },
						data: {
							amount: calculateUSDAmountByRate(transaction.originalCurrencyAmount, bcvPrice),
							exchangeRateUsed: bcvPrice,
							exchangeRateSource: 'pydolar',
							exchangeRateSourceKey: 'bcv',
						},
					})
				);
			}

			if (updatePromises.length > 0) {
				await prisma.$transaction(updatePromises);
			} else {
				logger.warn('Could not fetch historical VES exchange rates to update pending transactions.');
			}
		} catch (error) {
			logger.error("The DB couldn't be updated with the amount result", { error });
		}
	}
}

export const ExchangeCurrencyCronServices = new ExchangeCurrencyCronService();
