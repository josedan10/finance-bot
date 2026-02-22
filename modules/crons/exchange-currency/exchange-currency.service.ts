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
			},
			select: {
				originalCurrencyAmount: true,
				id: true,
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
			const bcvPrice = await this.getLatestExchangeCurrency();
			if (bcvPrice !== undefined && bcvPrice !== null) {
				const transactionsWithAmount = transactionsData.map((transaction) => ({
					id: transaction.id,
					amount: transaction.originalCurrencyAmount
						? calculateUSDAmountByRate(transaction.originalCurrencyAmount, bcvPrice)
						: 0,
				}));

				for (const transactionToBeUpdated of transactionsWithAmount) {
					await prisma.transaction.update({
						where: {
							id: transactionToBeUpdated.id,
						},
						data: {
							amount: transactionToBeUpdated.amount,
						},
					});
				}
			} else {
				logger.warn('Could not fetch the latest exchange rate.');
			}
		} catch (error) {
			logger.error("The DB couldn't be updated with the amount result", { error });
		}
	}
}

export const ExchangeCurrencyCronServices = new ExchangeCurrencyCronService();
