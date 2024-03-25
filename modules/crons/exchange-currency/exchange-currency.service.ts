import { PrismaModule as prisma } from '../../database/database.module';
import { searchRateByDate, calculateUSDAmountByRate } from '../../../src/helpers/rate.helper';
import { Decimal } from '@prisma/client/runtime/library';
import { Transaction } from '.prisma/client';

class ExchangeCurrencyCronService {
	// This method gets the Original value on VES and doesn't have the dollar amount yet of each transaction
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

	// This method gets the latest Exchange currency of the BCV
	async getLatestExchangeCurrency(date?: string): Promise<Decimal | undefined | null> {
		const exchange = await searchRateByDate(date);
		return exchange?.bcvPrice;
	}

	// This method calculates the amount in dollars based on the latest exchange currency of the BCV and the original value on VES
	// of each transaction
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

				transactionsWithAmount.forEach(async (transactionToBeUpdated) => {
					await prisma.transaction.update({
						where: {
							id: transactionToBeUpdated.id,
						},
						data: {
							amount: transactionToBeUpdated.amount,
						},
					});
				});
			} else {
				console.log('Could not fetch the latest exchange rate.');
			}
		} catch (error) {
			console.log("The DB couldn't be updated with the amount result");
		}
	}
}

export const ExchangeCurrencyCronServices = new ExchangeCurrencyCronService();
