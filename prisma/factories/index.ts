/* eslint-disable @typescript-eslint/no-explicit-any */
import { faker } from '@faker-js/faker';
import { Category, DailyExchangeRate, Keyword, PaymentMethod, Transaction } from '@prisma/client';
import { TransactionTypeArray } from '../../src/enums/transactions';

export function createCategory(data: any): Category {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		name: faker.word.noun(),
		description: faker.lorem.sentence(),
		amountLimit: faker.datatype.number({ min: 1, max: 100 }),
		transaction: [],
		shopCategory: [],
		categoryKeyword: [],
		...data,
	};
}

export function createTransaction(data: any): Transaction {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		description: faker.lorem.sentence(),
		originalCurrencyAmount: faker.datatype.number({ min: 1, max: 100 }),
		currency: faker.finance.currencyCode(),
		date: faker.date.recent(),
		reviewed: false,
		type: faker.helpers.arrayElement(TransactionTypeArray),
		isMonthly: false,
		isAnnually: false,
		category: [],
		...data,
	};
}

export function createTransactionWithCategory(data: any): { transaction: Transaction; category: Category } {
	return {
		transaction: createTransaction(data.transaction),
		category: createCategory(data.category),
	};
}

export function createDailyExchangeRate(data: any): DailyExchangeRate {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		currency: faker.finance.currencyCode(),
		date: faker.date.recent(),
		bcvPrice: faker.datatype.float({ min: 1, max: 300 }),
		monitorPrice: faker.datatype.float({ min: 1, max: 300 }),
		createdAt: faker.date.recent(),
		...data,
	};
}

export function createPaymentMethod(data: any): PaymentMethod {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		name: faker.lorem.word(),
		description: faker.lorem.sentence(),
		transactions: [],
		...data,
	};
}

export function createKeyword(data: any): Keyword {
	return {
		id: faker.datatype.number({ min: 1, max: 100 }),
		name: faker.lorem.word(),
		category: [],
		...data,
	};
}
