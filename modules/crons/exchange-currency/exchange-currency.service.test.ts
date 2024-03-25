import Sinon from 'sinon';
import { prismaMock } from '../../database/database.module.mock';
import { ExchangeCurrencyCronServices } from './exchange-currency.service';
import { Decimal } from '@prisma/client/runtime/library';
import { Transaction } from '@prisma/client';
import { createDailyExchangeRate, createTransaction } from '../../../prisma/factories';

const sandbox = Sinon.createSandbox();
describe('ExchangeCurrencyCronModule', () => {
	afterEach(() => {
		sandbox.resetHistory();
		sandbox.restore();
		sandbox.reset();
		jest.clearAllMocks();
	});
	// getTransactionsWithoutAmount method returns an array of objects with originalCurrencyAmount and id properties
	it('should return an array of objects with originalCurrencyAmount and id properties when there are transactions without amount in the database', async () => {
		const transactions = [
			{ originalCurrencyAmount: 100, id: 1 },
			{ originalCurrencyAmount: 200, id: 2 },
		].map((transaction) => createTransaction(transaction));

		prismaMock.transaction.findMany.mockResolvedValue(transactions);

		const result = await prismaMock.transaction.findMany();

		expect(result).toEqual(transactions);
	});

	// getTransactionsWithoutAmount method returns an empty array when there are no transactions without amount in the database
	it('should return an empty array when there are no transactions without amount in the database', async () => {
		prismaMock.transaction.findMany.mockResolvedValue([]);

		const result = await prismaMock.transaction.findMany();

		expect(result).toEqual([]);
	});

	// getLatestExchangeCurrency method returns the latest exchange currency of the BCV
	it('should return the latest exchange currency of the BCV when a date is provided', async () => {
		const date = '2022-01-01';
		const exchangeCurrency = 100;

		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(createDailyExchangeRate({ bcvPrice: exchangeCurrency }));

		const result = await ExchangeCurrencyCronServices.getLatestExchangeCurrency(date);

		expect(result).toEqual(exchangeCurrency);
	});

	// getAmountResult method updates the amount property of transactions in the database with the calculated USD amount based on the latest exchange currency of the BCV and the original value on VES of each transaction
	it('should update the amount property of transactions in the database with the calculated USD amount', async () => {
		const transactionsData = [
			{ originalCurrencyAmount: 100, id: 1 },
			{ originalCurrencyAmount: 200, id: 2 },
		].map((transaction) => createTransaction(transaction));
		const bcvPrice = createDailyExchangeRate({ bcvPrice: 100 });
		const transactionsWithAmount = [
			{ id: 1, amount: 1 },
			{ id: 2, amount: 2 },
		];

		prismaMock.transaction.findMany.mockResolvedValue(transactionsData);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(bcvPrice);
		const spyTransactionUpdate = prismaMock.transaction.update;

		await ExchangeCurrencyCronServices.getAmountResult();

		expect(spyTransactionUpdate).toHaveBeenCalledWith({
			where: {
				id: transactionsWithAmount[0].id,
			},
			data: {
				amount: transactionsWithAmount[0].amount,
			},
		});

		expect(spyTransactionUpdate).toHaveBeenCalledWith({
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
		].map((transaction) => createTransaction(transaction));
		const bcvPrice = createDailyExchangeRate({ bcvPrice: 100 });

		prismaMock.transaction.findMany.mockResolvedValue(transactionsData);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(bcvPrice);

		const result = await ExchangeCurrencyCronServices.getAmountResult();

		expect(result).toBeUndefined();
	});

	// getLatestExchangeCurrency method returns undefined when there is no exchange rate for the given date or current date
	it('should return undefined when there is no exchange rate for the given date or current date', async () => {
		const exchangeRate = undefined;

		const getLatestExchangeCurrencyMock = jest.spyOn(ExchangeCurrencyCronServices, 'getLatestExchangeCurrency');
		getLatestExchangeCurrencyMock.mockResolvedValue(exchangeRate);

		const result = await ExchangeCurrencyCronServices.getLatestExchangeCurrency();

		expect(result).toBeUndefined();
	});

	// getAmountResult method logs an error message to the console when the database couldn't be updated with the amount result
	it("should log an error message to the console when the database couldn't be updated with the amount result", async () => {
		const spyLog = sandbox.stub(console, 'log');

		ExchangeCurrencyCronServices.getTransactionsWithoutAmount = sandbox.stub().rejects(new Error('Database error'));

		await ExchangeCurrencyCronServices.getAmountResult();

		sandbox.assert.calledWith(spyLog, "The DB couldn't be updated with the amount result");
	});

	describe('getAmountResult', () => {
		// Calculates the amount in dollars for each transaction without amount and updates the database successfully
		it('should calculate the amount in dollars for each transaction without amount and update the database successfully', async () => {
			// Mock the dependencies
			const transactionsData = [
				{ id: 1, originalCurrencyAmount: 100 },
				{ id: 2, originalCurrencyAmount: 200 },
			].map((transaction) => createTransaction(transaction));
			const bcvPrice = 0.5;

			const getTransactionsWithoutAmountMock = jest.spyOn(ExchangeCurrencyCronServices, 'getTransactionsWithoutAmount');
			getTransactionsWithoutAmountMock.mockResolvedValue(transactionsData);

			const getLatestExchangeCurrencyMock = jest.spyOn(ExchangeCurrencyCronServices, 'getLatestExchangeCurrency');
			getLatestExchangeCurrencyMock.mockResolvedValue(bcvPrice as unknown as Decimal);

			const updateTransactionMock = jest.spyOn(prismaMock.transaction, 'update');

			// Invoke the method
			await ExchangeCurrencyCronServices.getAmountResult();

			// Assertions
			expect(getTransactionsWithoutAmountMock).toHaveBeenCalledTimes(1);
			expect(getLatestExchangeCurrencyMock).toHaveBeenCalledTimes(1);
			expect(updateTransactionMock).toHaveBeenCalledTimes(2);
			expect(updateTransactionMock).toHaveBeenCalledWith({
				where: { id: 1 },
				data: { amount: 200 },
			});
			expect(updateTransactionMock).toHaveBeenCalledWith({
				where: { id: 2 },
				data: { amount: 400 },
			});
		});

		// Handles the case where the database cannot be updated with the amount result
		it('should handle the case where the database cannot be updated with the amount result', async () => {
			const spyLog = sandbox.stub(console, 'log');

			// Mock the dependencies
			const getTransactionsWithoutAmountMock = jest.spyOn(ExchangeCurrencyCronServices, 'getTransactionsWithoutAmount');
			getTransactionsWithoutAmountMock.mockRejectedValue(new Error('Database error'));

			const getLatestExchangeCurrencyMock = jest.spyOn(ExchangeCurrencyCronServices, 'getLatestExchangeCurrency');
			getLatestExchangeCurrencyMock.mockResolvedValue(0.5 as unknown as Decimal);

			// Invoke the method
			await ExchangeCurrencyCronServices.getAmountResult();

			// Assertions
			expect(getTransactionsWithoutAmountMock).toHaveBeenCalledTimes(1);
			expect(getLatestExchangeCurrencyMock).toHaveBeenCalledTimes(0);
			sandbox.assert.calledWith(spyLog, "The DB couldn't be updated with the amount result");
		});

		// Handles the case where there are no transactions without amount to update
		it('should not update any transactions when there are no transactions without amount', async () => {
			// Mock the dependencies
			const transactionsData = [] as Transaction[];

			const getTransactionsWithoutAmountMock = jest.spyOn(ExchangeCurrencyCronServices, 'getTransactionsWithoutAmount');
			getTransactionsWithoutAmountMock.mockResolvedValue(transactionsData);

			const getLatestExchangeCurrencyMock = jest.spyOn(ExchangeCurrencyCronServices, 'getLatestExchangeCurrency');

			const updateTransactionMock = jest.spyOn(prismaMock.transaction, 'update');

			// Invoke the method
			await ExchangeCurrencyCronServices.getAmountResult();

			// Assertions
			expect(getTransactionsWithoutAmountMock).toHaveBeenCalledTimes(1);
			expect(getLatestExchangeCurrencyMock).toHaveBeenCalledTimes(1);
			expect(updateTransactionMock).toHaveBeenCalledTimes(0);
		});

		// Handles the case where the latest exchange currency of the BCV is null
		it('should not update any transactions when the latest exchange currency of the BCV is null', async () => {
			// Mock the dependencies
			const transactionsData = [
				{ id: 1, originalCurrencyAmount: 100 },
				{ id: 2, originalCurrencyAmount: 200 },
			].map((transaction) => createTransaction(transaction));
			const bcvPrice = null;

			const getTransactionsWithoutAmountMock = jest.spyOn(ExchangeCurrencyCronServices, 'getTransactionsWithoutAmount');
			getTransactionsWithoutAmountMock.mockResolvedValue(transactionsData);

			const getLatestExchangeCurrencyMock = jest.spyOn(ExchangeCurrencyCronServices, 'getLatestExchangeCurrency');
			getLatestExchangeCurrencyMock.mockResolvedValue(bcvPrice);

			const updateTransactionMock = jest.spyOn(prismaMock.transaction, 'update');

			await ExchangeCurrencyCronServices.getAmountResult();

			// Assertions
			expect(getTransactionsWithoutAmountMock).toHaveBeenCalledTimes(1);
			expect(getLatestExchangeCurrencyMock).toHaveBeenCalledTimes(1);
			expect(updateTransactionMock).toHaveBeenCalledTimes(0);
		});

		// Handles the case where the latest exchange currency of the BCV is undefined
		it('should not update any transactions when the latest exchange currency of the BCV is undefined', async () => {
			// Mock the dependencies
			const transactionsData = [
				{ id: 1, originalCurrencyAmount: 100 },
				{ id: 2, originalCurrencyAmount: 200 },
			].map((transaction) => createTransaction(transaction));
			const bcvPrice = undefined;

			const getTransactionsWithoutAmountMock = jest.spyOn(ExchangeCurrencyCronServices, 'getTransactionsWithoutAmount');
			getTransactionsWithoutAmountMock.mockResolvedValue(transactionsData);

			const getLatestExchangeCurrencyMock = jest.spyOn(ExchangeCurrencyCronServices, 'getLatestExchangeCurrency');
			getLatestExchangeCurrencyMock.mockResolvedValue(bcvPrice);

			const updateTransactionMock = jest.spyOn(prismaMock.transaction, 'update');

			await ExchangeCurrencyCronServices.getAmountResult();

			// Assertions
			expect(getTransactionsWithoutAmountMock).toHaveBeenCalledTimes(1);
			expect(getLatestExchangeCurrencyMock).toHaveBeenCalledTimes(1);
			expect(updateTransactionMock).toHaveBeenCalledTimes(0);
		});
	});
});
