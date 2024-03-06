import prisma from '../../database/database.module.js';
import { searchRateByDate, calculateUSDAmountByRate } from '../../../src/helpers/rate.helper.js';

class ExchangeCurrencyCronModule {
	// This method gets the Original value on VES and doesn't have the dollar amount yet of each transaction
	async getTransactionsWithoutAmount() {
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
	async getLatestExchangeCurrency(date = undefined) {
		const exchange = await searchRateByDate(date);
		return exchange?.bcvPrice;
	}

	// This method calculates the amount in dollars based on the latest exchange currency of the BCV and the original value on VES
	// of each transaction
	async getAmountResult() {
		try {
			const transactionsData = await this.getTransactionsWithoutAmount();
			const bcvPrice = await this.getLatestExchangeCurrency();
			const transactionsWithAmount = transactionsData.map((transaction) => ({
				id: transaction.id,
				amount: calculateUSDAmountByRate(transaction.originalCurrencyAmount, bcvPrice),
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
		} catch (error) {
			console.log("The DB couldn't be updated with the amount result");
		}
	}
}

export const ExchangeCurrencyCronModules = new ExchangeCurrencyCronModule();
