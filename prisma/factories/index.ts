import { faker } from '@faker-js/faker';
import { Category, DailyExchangeRate, Keyword, PaymentMethod, Transaction } from '@prisma/client';
import { TransactionTypeArray } from '../../src/enums/transactions';

export function createCategory(data: Partial<Category> = {}): Category {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		name: faker.word.noun(),
		description: faker.lorem.sentence(),
		amountLimit: faker.datatype.number({ min: 1, max: 100 }),
		...data,
	} as Category;
}

export function createTransaction(data: Partial<Transaction> = {}): Transaction {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		description: faker.lorem.sentence(),
		originalCurrencyAmount: faker.datatype.number({ min: 1, max: 100 }),
		currency: faker.finance.currencyCode(),
		date: faker.date.recent(),
		reviewed: false,
		reviewedAt: null,
		type: faker.helpers.arrayElement(TransactionTypeArray),
		isMonthly: false,
		isAnnually: false,
		amount: faker.datatype.number({ min: 1, max: 1000 }),
		referenceId: null,
		telegramFileIds: null,
		categoryId: null,
		shopId: null,
		paymentMethodId: null,
		...data,
	} as Transaction;
}

export function createTransactionWithCategory(
	data: { transaction?: Partial<Transaction>; category?: Partial<Category> } = {}
): { transaction: Transaction; category: Category } {
	return {
		transaction: createTransaction(data.transaction),
		category: createCategory(data.category),
	};
}

export function createDailyExchangeRate(data: Partial<DailyExchangeRate> = {}): DailyExchangeRate {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		date: faker.date.recent(),
		bcvPrice: faker.datatype.float({ min: 1, max: 300 }),
		monitorPrice: faker.datatype.float({ min: 1, max: 300 }),
		createdAt: faker.date.recent(),
		...data,
	} as DailyExchangeRate;
}

export function createPaymentMethod(data: Partial<PaymentMethod> = {}): PaymentMethod {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		name: faker.lorem.word(),
		...data,
	} as PaymentMethod;
}

export function createKeyword(data: Partial<Keyword> = {}): Keyword {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		name: faker.lorem.word(),
		description: null,
		...data,
	} as Keyword;
}
