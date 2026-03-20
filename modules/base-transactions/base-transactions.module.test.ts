import { BaseTransactions } from './base-transactions.module';
import Sinon from 'sinon';
import { expect, jest } from '@jest/globals';
import {
	createCategory,
	createDailyExchangeRate,
	createPaymentMethod,
	createTransaction,
} from '../../prisma/factories';
import { prismaMock } from '../database/database.module.mock';
import { Decimal } from '@prisma/client/runtime/library';
import { ExchangeCurrencyCronServices } from '../crons/exchange-currency/exchange-currency.service';

const sandbox = Sinon.createSandbox();

describe('BaseTransactions', () => {
	beforeEach(() => {
		prismaMock.transaction.findMany.mockResolvedValue([]);
		prismaMock.transaction.findFirst.mockResolvedValue(null);
	});

	afterEach(() => {
		sandbox.reset();
		sandbox.restore();
		sandbox.resetHistory();
	});
	// Tests that registerManualTransactions successfully registers a manual transaction with valid data
	it('should successfully register a manual transaction with valid data', async () => {
		// Mock the database methods
		const paymentMethod = await createPaymentMethod({ id: 1 });
		const category = await createCategory({ id: 1 });
		const transaction = await createTransaction({ id: 1 });

		const spyPaymentMethodFindFirst = prismaMock.paymentMethod.findFirst.mockResolvedValue(paymentMethod);
		const spyCategoryFindFirst = prismaMock.category.findFirst.mockResolvedValue(category);
		const spyTransactionCreate = prismaMock.transaction.create.mockResolvedValue(transaction);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(null);

		// Call the registerManualTransactions method
		const data = [
			'amount=100;',
			'desc=My description;',
			'method=Mercantil Venezuela;',
			'type=debit;',
			'cat=Entertaiment',
		];
		await BaseTransactions.registerManualTransactions(data, 1);

		expect(spyPaymentMethodFindFirst).toHaveBeenCalledTimes(1);
		expect(spyTransactionCreate).toHaveBeenCalledTimes(1);
		expect(spyCategoryFindFirst).toHaveBeenCalledTimes(1);
	});

	// New tests for findDuplicate
	describe('findDuplicate', () => {
		it('should find a duplicate by referenceId', async () => {
			const existingTx = await createTransaction({ id: 10, referenceId: 'REF123' });
			prismaMock.transaction.findFirst.mockResolvedValue(existingTx);

			const result = await BaseTransactions.findDuplicate({
				userId: 1,
				amount: 100,
				date: new Date(),
				type: 'debit',
				currency: 'USD',
				referenceId: 'REF123'
			});

			expect(result).toEqual(existingTx);
		});

		it('should find a fuzzy duplicate by amount and date window', async () => {
			const fixedDate = new Date('2026-03-18T12:00:00Z');
			const existingTx = await createTransaction({ 
				id: 11, 
				amount: 50 as any, 
				description: 'Dinner at McDonalds',
				type: 'debit',
				date: fixedDate
			});
			prismaMock.transaction.findMany.mockResolvedValue([existingTx]);

			const result = await BaseTransactions.findDuplicate({
				userId: 1,
				amount: 50,
				date: fixedDate,
				type: 'debit',
				currency: 'USD',
				description: 'McDonalds payment'
			});

			expect(result).toEqual(existingTx);
		});

		it('should not match as duplicate if descriptions are completely different', async () => {
			const existingTx = await createTransaction({ 
				id: 12, 
				amount: new Decimal(50), 
				description: 'Gas station',
				type: 'debit'
			});
			prismaMock.transaction.findMany.mockResolvedValue([existingTx]);

			const result = await BaseTransactions.findDuplicate({
				userId: 1,
				amount: 50,
				date: new Date(),
				type: 'debit',
				currency: 'USD',
				description: 'Netflix subscription'
			});

			expect(result).toBeNull();
		});

		it('should NOT match as duplicate if amounts are the same but currencies are different', async () => {
			const existingTx = await createTransaction({ 
				id: 13, 
				amount: 50 as any, 
				currency: 'USD',
				type: 'debit'
			});
			prismaMock.transaction.findMany.mockResolvedValue([existingTx]);

			const result = await BaseTransactions.findDuplicate({
				userId: 1,
				amount: 50,
				date: new Date(),
				type: 'debit',
				currency: 'VES',
				description: 'Same amount, different currency'
			});

			expect(result).toBeNull();
		});
	});

	describe('safeCreateTransaction', () => {
		it('should normalize VES amounts internally if not already normalized', async () => {
			prismaMock.transaction.findMany.mockResolvedValue([]); // No duplicates
			prismaMock.dailyExchangeRate.findFirst.mockResolvedValue({ bcvPrice: 40 as any } as any);
			
			const transaction = await createTransaction({ id: 20, amount: 2.5 as any, currency: 'VES', originalCurrencyAmount: 100 as any });
			prismaMock.transaction.create.mockResolvedValue(transaction);

			const result = await BaseTransactions.safeCreateTransaction({
				userId: 1,
				amount: 100,
				currency: 'VES',
				date: new Date(),
				type: 'debit',
				description: '100 VES transaction'
			});

			expect(Number(result.transaction.amount)).toBe(2.5);
			expect(prismaMock.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
				data: expect.objectContaining({
					amount: 2.5,
					originalCurrencyAmount: 100
				})
			}));
		});
	});
});

// Generated by CodiumAI

describe('registerManualTransactions', () => {
	beforeEach(() => {
		prismaMock.transaction.findMany.mockResolvedValue([]);
		prismaMock.transaction.findFirst.mockResolvedValue(null);
	});

	// Tests that the method creates a transaction with all required fields
	it('should create a transaction with all required fields', async () => {
		// Arrange
		const data = [
			'amount=100;',
			'desc=My description;',
			'method=Mercantil Venezuela;',
			'type=debit;',
			'cat=ENTERTAIMENT',
		];
		const paymentMethod = await createPaymentMethod({ id: 1 });
		const category = await createCategory({ id: 1 });
		const transaction = await createTransaction({ id: 1, amount: new Decimal(100), description: 'My description', type: 'debit' });

		// uses sinon to mock the database methods
		const spyPaymentMethodFindFirst = prismaMock.paymentMethod.findFirst.mockResolvedValue(paymentMethod);
		const spyCategoryFindFirst = prismaMock.category.findFirst.mockResolvedValue(category);
		const spyTransactionCreate = prismaMock.transaction.create.mockResolvedValue(transaction);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(null);

		// Act
		const result = await BaseTransactions.registerManualTransactions(data, 1);

		// Assert
		expect(result).toEqual(transaction);
		expect(spyTransactionCreate).toHaveBeenCalledTimes(1);
		expect(spyCategoryFindFirst).toHaveBeenCalledTimes(1);
		expect(spyPaymentMethodFindFirst).toHaveBeenCalledTimes(1);
	});

	// Tests that the method creates a transaction with optional fields (currency, date)
	it('should create a transaction with optional fields', async () => {
		// Arrange
		const data = [
			'amount=100;',
			'desc=My description;',
			'method=Mercantil Venezuela;',
			'type=debit;',
			'cat=ENTERTAIMENT;',
			'currency=VES;',
			'date=2022-01-01',
		];
		const paymentMethod = await createPaymentMethod({ id: 1 });
		const category = await createCategory({ id: 1 });
		const transaction = await createTransaction({ id: 1, amount: new Decimal(100), description: 'My description', type: 'debit' });

		const spyPaymentMethodFindFirst = prismaMock.paymentMethod.findFirst.mockResolvedValue(paymentMethod);
		const spyCategoryFindFirst = prismaMock.category.findFirst.mockResolvedValue(category);
		const spyTransactionCreate = prismaMock.transaction.create.mockResolvedValue(transaction);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(null);

		// Act
		const result = await BaseTransactions.registerManualTransactions(data, 1);

		// Assert
		expect(result).toEqual(transaction);
		expect(spyTransactionCreate).toHaveBeenCalledTimes(1);
		expect(spyCategoryFindFirst).toHaveBeenCalledTimes(1);
		expect(spyPaymentMethodFindFirst).toHaveBeenCalledTimes(1);
	});

	// Tests that the method converts VES to USD and creates a transaction
	it('should convert VES to USD and create a transaction', async () => {
		// Arrange
		const data = [
			'amount=100;',
			'desc=My description;',
			'method=Mercantil Venezuela;',
			'type=debit;',
			'cat=Entertaiment;',
			'currency=VES',
		];

		const paymentMethod = await createPaymentMethod({ id: 1 });
		const category = await createCategory({ id: 1 });
		const transaction = await createTransaction({ id: 1, amount: new Decimal(1), description: 'My description', type: 'debit' });
		const exchangeRate = await createDailyExchangeRate({ monitorPrice: new Decimal(100) });

		// Mock the database methods
		const spyPaymentMethodFindFirst = prismaMock.paymentMethod.findFirst.mockResolvedValue(paymentMethod);
		const spyCategoryFindFirst = prismaMock.category.findFirst.mockResolvedValue(category);
		const spyTransactionCreate = prismaMock.transaction.create.mockResolvedValue(transaction);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(exchangeRate);

		// Act
		const result = await BaseTransactions.registerManualTransactions(data, 1);

		// Assert
		expect(result).toEqual(transaction);
		expect(spyTransactionCreate).toHaveBeenCalledTimes(1);
		expect(spyCategoryFindFirst).toHaveBeenCalledTimes(1);
		expect(spyPaymentMethodFindFirst).toHaveBeenCalledTimes(1);
	});

	// Tests that the method throws an error if any required field is missing
	it('should throw an error if any required field is missing', async () => {
		// Arrange
		const data = ['amount=100;', 'desc=My description;', 'method=Mercantil Venezuela;', 'type=debit;', 'FOOD/HOME'];
		const sampleData =
			'amount=100; desc=My description; method=Mercantil Venezuela; type=debit; cat=CATEGORY_NAME; currency=VES; date=2021-01-01';

		// Act & Assert
		await expect(BaseTransactions.registerManualTransactions(data, 1)).rejects.toThrow(
			`Invalid data: ${data}... Try with ${sampleData}`
		);

		const data1 = ['100;', 'My description;', 'Mercantil Venezuela;', 'debit;', 'FOOD/HOME'];

		await expect(BaseTransactions.registerManualTransactions(data1, 1)).rejects.toThrow(
			`Invalid data: ${data1}... Try with ${sampleData}`
		);
	});

	// Tests that the method throws an error if payment method is not found
	it('should throw an error if payment method is not found', async () => {
		// Arrange
		const data = [
			'amount=100;',
			'desc=My description;',
			'method=Mercantil Venezuela;',
			'type=debit;',
			'cat=ENTERTAIMENT;',
		];

		prismaMock.paymentMethod.findFirst.mockResolvedValue(null);

		// Act & Assert
		await expect(BaseTransactions.registerManualTransactions(data, 1)).rejects.toThrow(
			'Payment method Mercantil Venezuela not found'
		);
	});

	// Tests that the method throws an error if category is not found
	it('should throw an error if category is not found', async () => {
		// Arrange
		const data = [
			'amount=100;',
			'desc=My description;',
			'method=Mercantil Venezuela;',
			'type=debit;',
			'cat=RANDOM_CATEGORY;',
		];

		const paymentMethod = await createPaymentMethod({ id: 1 });

		prismaMock.category.findFirst.mockResolvedValue(null);
		prismaMock.paymentMethod.findFirst.mockResolvedValue(paymentMethod);

		// Act & Assert
		await expect(BaseTransactions.registerManualTransactions(data, 1)).rejects.toThrow(
			'Category RANDOM_CATEGORY not found'
		);
	});
});

// Generated by CodiumAI

describe('parseTransactionFromText', () => {
	beforeEach(() => {
		prismaMock.category.findFirst.mockResolvedValue(null);
		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(null);
		prismaMock.keyword.findMany.mockResolvedValue([]);
	});

	it('should parse a simple receipt text correctly', async () => {
		const textLines = ['McDonalds', 'TOTAL 10.50', 'FECHA: 18/03/2026'];
		const result = await BaseTransactions.parseTransactionFromText(textLines, 1);

		expect(result.amount).toEqual(10.50);
		expect(result.date).toEqual('2026-03-18');
		expect(result.description).toContain('McDonalds');
		expect(result.category).toEqual('Other');
	});

	it('should throw error if amount is missing', async () => {
		const textLines = ['Just some text', 'No numbers here'];
		await expect(BaseTransactions.parseTransactionFromText(textLines, 1)).rejects.toThrow('Amount not found');
	});

	it('should find category based on keywords in text', async () => {
		const category = await createCategory({ id: 5, name: 'Food' });
		prismaMock.keyword.findMany.mockResolvedValue([
			{ name: 'mcdonalds', categoryKeyword: [{ category }] } as any
		]);

		const textLines = ['Lunch at McDonalds', 'TOTAL 15.00'];
		const result = await BaseTransactions.parseTransactionFromText(textLines, 1);

		expect(result.category).toEqual('Food');
		expect(result.categoryId).toEqual(5);
	});
});

describe('registerTransactionFromImages', () => {
	beforeEach(() => {
		prismaMock.transaction.findMany.mockResolvedValue([]);
		prismaMock.transaction.findFirst.mockResolvedValue(null);
		prismaMock.keyword.findMany.mockResolvedValue([]);
	});

	// Given a valid array of text from images, the method should search for a category that matches the keywords in each line and create a transaction with the found category.
	it('should create a transaction with the found category when given a valid array of text from images', async () => {
		// Mock the database module
		const category = await createCategory({ id: 1, name: 'Food' });
		const transaction = await createTransaction({ id: 1, categoryId: 1 });
		(transaction as any).category = category;

		const keywordsResult = [
			{
				name: 'petshop',
				categoryKeyword: [{ category }]
			}
		];
		const spyKeywordFindMany = prismaMock.keyword.findMany.mockResolvedValue(keywordsResult as any);

		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(null);
		const spyTransactionCreate = prismaMock.transaction.create.mockResolvedValue(transaction);

		// Define the input data
		const data = ['my petshop', 'TOTAL 538.53', 'image text 3'];
		const telegramFileIds = ['file_id_1', 'file_id_2'];

		// Call the method
		const result = await BaseTransactions.registerTransactionFromImages(data, telegramFileIds, undefined, 1);

		// Verify the result
		expect(result.transaction.id).toEqual(1);
		expect(result.category?.id).toEqual(1);

		// Verify that the database module was called correctly
		expect(spyKeywordFindMany).toHaveBeenCalledTimes(1);
		expect(spyTransactionCreate).toHaveBeenCalledTimes(1);
		expect(spyTransactionCreate).toBeCalledWith({
			data: {
				userId: 1,
				amount: 538.53,
				originalCurrencyAmount: 538.53,
				description: 'my petshop TOTAL 538.53 image text 3',
				type: 'debit',
				currency: 'VES',
				telegramFileIds: 'file_id_1,file_id_2',
				date: expect.any(Date),
				categoryId: 1,
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		});
	});

	it('should not create a transaction if there is not amount found. It should throws an error', async () => {
		// Define the input data
		const data = ['my petshop', 'image text 3'];
		const telegramFileIds = ['file_id_1', 'file_id_2'];

		// Call the method
		await expect(BaseTransactions.registerTransactionFromImages(data, telegramFileIds, undefined, 1)).rejects.toThrow(
			'Amount not found'
		);
	});

	it('should create the transaction without category and create a task', async () => {
		const spyKeywordFindMany = prismaMock.keyword.findMany.mockResolvedValue([]);

		prismaMock.dailyExchangeRate.findFirst.mockResolvedValue(null);

		const transaction = await createTransaction({ id: 1 });
		(transaction as any).category = null;

		const spyTransactionCreate = prismaMock.transaction.create.mockResolvedValue(transaction);

		// Define the input data
		const data = ['my petshop', 'TOTAL 538.53', 'image text 3'];
		const telegramFileIds = ['file_id_1', 'file_id_2'];

		// Call the method
		const result = await BaseTransactions.registerTransactionFromImages(data, telegramFileIds, undefined, 1);

		// Verify the result
		expect(result.transaction.id).toEqual(1);
		expect(result.category).toEqual(null);

		// Verify that the database module was called correctly
		expect(spyKeywordFindMany).toHaveBeenCalledTimes(1);
		expect(spyTransactionCreate).toHaveBeenCalledTimes(1);
		expect(spyTransactionCreate).toHaveBeenCalledWith({
			data: {
				userId: 1,
				amount: 538.53,
				originalCurrencyAmount: 538.53,
				description: 'my petshop TOTAL 538.53 image text 3',
				type: 'debit',
				telegramFileIds: 'file_id_1,file_id_2',
				date: expect.any(Date),
				currency: 'VES',
				categoryId: undefined,
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		});
	});
});

describe('_VESToUSDWithExchangeRateByDate', () => {
	it("should convert VES to USD using the current exchange rate where the transaction date is different to today's date", async () => {
		ExchangeCurrencyCronServices.getLatestExchangeCurrency = jest.fn(async () => 100 as unknown as Decimal);

		// Call the method
		const result = await BaseTransactions._VESToUSDWithExchangeRateByDate('2022-01-01', 100);

		// Verify the result
		expect(result).toEqual(1.0);
	});

	it("should convert VES to USD using the current exchange rate where the transaction date is the same as today's date", async () => {
		ExchangeCurrencyCronServices.getLatestExchangeCurrency = jest.fn(async () => 100 as unknown as Decimal);

		jest.useFakeTimers().setSystemTime(new Date('2022-01-01').getTime());

		// Call the method
		const result = await BaseTransactions._VESToUSDWithExchangeRateByDate('2022-01-01', 100);

		// Verify the result
		expect(result).toEqual(1.0);
	});

	it('should return null if the exchange rate is not found', async () => {
		// Mock the database module
		ExchangeCurrencyCronServices.getLatestExchangeCurrency = jest.fn(async () => null);

		// Call the method
		const result = await BaseTransactions._VESToUSDWithExchangeRateByDate('2022-01-01', 100);

		// Verify the result
		expect(result).toEqual(null);
	});

	it('should return a value if the date is weekend day', async () => {
		// Mock the database module
		jest.useFakeTimers().setSystemTime(new Date('2024-03-03').getTime());
		ExchangeCurrencyCronServices.getLatestExchangeCurrency = jest.fn(async () => 100 as unknown as Decimal);

		// Call the method with a weekend date
		const result = await BaseTransactions._VESToUSDWithExchangeRateByDate('2024-03-03', 100);

		// Verify the result
		expect(result).toEqual(1.0);
	});

	it('should return a value if the execution hour is before 9:00 or after 11:00', async () => {
		// Mock the database module
		jest.useFakeTimers().setSystemTime(new Date('2024-03-05T08:59:59').getTime());
		ExchangeCurrencyCronServices.getLatestExchangeCurrency = jest.fn(async () => 100 as unknown as Decimal);

		// Call the method with a weekday date
		const result = await BaseTransactions._VESToUSDWithExchangeRateByDate('2024-03-05', 100);
		expect(result).toEqual(1.0);

		jest.useFakeTimers().setSystemTime(new Date('2024-03-05T11:00:01').getTime());

		// Call the method with a weekday date
		const result2 = await BaseTransactions._VESToUSDWithExchangeRateByDate('2024-03-05', 100);

		expect(result2).toEqual(1.0);
	});
});
