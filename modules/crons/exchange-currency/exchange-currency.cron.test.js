import Sinon from 'sinon';
import prisma from '../../database/database.module';
import { ExchangeCurrencyCronModules } from './exchange-currency.cron';

describe('ExchangeCurrencyCronModule', () => {
	// getTransactionsWithoutAmount method returns an array of objects with originalCurrencyAmount and id properties
	it('should return an array of objects with originalCurrencyAmount and id properties when there are transactions without amount in the database', async () => {
		const transactions = [
			{ originalCurrencyAmount: 100, id: 1 },
			{ originalCurrencyAmount: 200, id: 2 },
		];

		prisma.transaction.findMany = Sinon.stub().resolves(transactions);

		const result = await prisma.transaction.findMany();

		expect(result).toEqual(transactions);
	});

	// getTransactionsWithoutAmount method returns an empty array when there are no transactions without amount in the database
	it('should return an empty array when there are no transactions without amount in the database', async () => {
		prisma.transaction.findMany = Sinon.stub().resolves([]);

		const result = await prisma.transaction.findMany();

		expect(result).toEqual([]);
	});

	// getLatestExchangeCurrency method returns the latest exchange currency of the BCV
	it('should return the latest exchange currency of the BCV when a date is provided', async () => {
		const date = '2022-01-01';
		const exchangeCurrency = 100;

		prisma.dailyExchangeRate.findFirst = Sinon.stub().resolves({ bcvPrice: exchangeCurrency });

		const result = await ExchangeCurrencyCronModules.getLatestExchangeCurrency(date);

		expect(result).toEqual(exchangeCurrency);
	});

	// getAmountResult method updates the amount property of transactions in the database with the calculated USD amount based on the latest exchange currency of the BCV and the original value on VES of each transaction
	it('should update the amount property of transactions in the database with the calculated USD amount', async () => {
		const transactionsData = [
			{ originalCurrencyAmount: 100, id: 1 },
			{ originalCurrencyAmount: 200, id: 2 },
		];
		const bcvPrice = { bcvPrice: 100 };
		const transactionsWithAmount = [
			{ id: 1, amount: 1 },
			{ id: 2, amount: 2 },
		];

		prisma.transaction.findMany = Sinon.stub().resolves(transactionsData);
		prisma.dailyExchangeRate.findFirst = Sinon.stub().resolves(bcvPrice);
		prisma.transaction.update = Sinon.stub().resolves();

		await ExchangeCurrencyCronModules.getAmountResult();

		Sinon.assert.calledWith(prisma.transaction.update, {
			where: {
				id: transactionsWithAmount[0].id,
			},
			data: {
				amount: transactionsWithAmount[0].amount,
			},
		});

		Sinon.assert.calledWith(prisma.transaction.update, {
			where: {
				id: transactionsWithAmount[1].id,
			},
			data: {
				amount: transactionsWithAmount[1].amount,
			},
		});
	});

	// getAmountResult method returns undefined
	it('should return undefined after updating the amount property of transactions in the database', async () => {
		const transactionsData = [
			{ originalCurrencyAmount: 100, id: 1 },
			{ originalCurrencyAmount: 200, id: 2 },
		];
		const bcvPrice = { bcvPrice: 100 };

		prisma.transaction.findMany = Sinon.stub().resolves(transactionsData);
		prisma.dailyExchangeRate.findFirst = Sinon.stub().resolves(bcvPrice);
		prisma.transaction.update = Sinon.stub().resolves();

		const result = await ExchangeCurrencyCronModules.getAmountResult();

		expect(result).toBeUndefined();
	});

	// getLatestExchangeCurrency method returns undefined when there is no exchange rate for the given date or current date
	it('should return undefined when there is no exchange rate for the given date or current date', async () => {
		const exchangeRate = undefined;

		ExchangeCurrencyCronModules.getLatestExchangeCurrency = Sinon.stub().resolves(exchangeRate);

		const result = await ExchangeCurrencyCronModules.getLatestExchangeCurrency();

		expect(result).toBeUndefined();
	});

	// getAmountResult method logs an error message to the console when the database couldn't be updated with the amount result
	it("should log an error message to the console when the database couldn't be updated with the amount result", async () => {
		console.log = Sinon.stub();

		ExchangeCurrencyCronModules.getTransactionsWithoutAmount = Sinon.stub().rejects(new Error('Database error'));

		await ExchangeCurrencyCronModules.getAmountResult();

		Sinon.assert.calledWith(console.log, "The DB couldn't be updated with the amount result");
	});
});
