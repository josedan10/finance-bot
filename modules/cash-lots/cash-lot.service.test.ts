import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { CashLotService } from './cash-lot.service';
import { AppError } from '../../src/lib/appError';

type TestTransaction = {
	id: number;
	userId: number;
	date: Date;
	currency: string;
	amount: Decimal;
	originalCurrencyAmount: Decimal;
};

describe('CashLotService', () => {
	let service: CashLotService;
	let db: DeepMockProxy<PrismaClient>;

	beforeEach(() => {
		service = new CashLotService();
		db = mockDeep<PrismaClient>();
		jest.clearAllMocks();
	});

	it('creates a withdrawal cash lot with the destination remaining amount', async () => {
		const transaction: TestTransaction = {
			id: 10,
			userId: 1,
			date: new Date('2026-04-01T10:00:00.000Z'),
			currency: 'USD',
			amount: new Decimal(100),
			originalCurrencyAmount: new Decimal(100),
		} as never;

		db.cashLot.create.mockResolvedValue({
			id: 1,
			userId: 1,
			withdrawalTransactionId: 10,
			withdrawalDate: transaction.date,
			sourceAmount: new Decimal(100),
			sourceCurrency: 'USD',
			destinationAmount: new Decimal(120000),
			destinationCurrency: 'ARS',
			exchangeRate: new Decimal(1200),
			remainingAmount: new Decimal(120000),
			migrationStatus: 'linked',
			createdAt: new Date('2026-04-01T10:00:00.000Z'),
			updatedAt: new Date('2026-04-01T10:00:00.000Z'),
		} as never);

		const result = await service.createWithdrawalCashLot(
			transaction as never,
			{
				destinationAmount: 120000,
				destinationCurrency: 'ARS',
				exchangeRate: 1200,
			},
			db as never
		);

		expect(db.cashLot.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				userId: 1,
				withdrawalTransactionId: 10,
				sourceAmount: 100,
				sourceCurrency: 'USD',
				destinationAmount: 120000,
				destinationCurrency: 'ARS',
				exchangeRate: 1200,
				remainingAmount: 120000,
				migrationStatus: 'linked',
			}),
		});
		expect(result).toMatchObject({
			id: 1,
			destinationAmount: new Decimal(120000),
		});
	});

	it('updates an existing withdrawal cash lot when no allocations exist', async () => {
		const transaction: TestTransaction = {
			id: 11,
			userId: 1,
			date: new Date('2026-04-03T10:00:00.000Z'),
			currency: 'USD',
			amount: new Decimal(100),
			originalCurrencyAmount: new Decimal(100),
		} as never;

		db.cashLot.findFirst.mockResolvedValue({
			id: 7,
			userId: 1,
			withdrawalTransactionId: 11,
			withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
			sourceAmount: new Decimal(100),
			sourceCurrency: 'USD',
			destinationAmount: new Decimal(120000),
			destinationCurrency: 'ARS',
			exchangeRate: new Decimal(1200),
			remainingAmount: new Decimal(120000),
			migrationStatus: 'linked',
			createdAt: new Date('2026-04-01T10:00:00.000Z'),
			updatedAt: new Date('2026-04-01T10:00:00.000Z'),
			allocations: [],
		} as never);
		db.cashLot.update.mockResolvedValue({
			id: 7,
			userId: 1,
			withdrawalTransactionId: 11,
			withdrawalDate: transaction.date,
			sourceAmount: new Decimal(100),
			sourceCurrency: 'USD',
			destinationAmount: new Decimal(130000),
			destinationCurrency: 'ARS',
			exchangeRate: new Decimal(1300),
			remainingAmount: new Decimal(130000),
			migrationStatus: 'linked',
			createdAt: new Date('2026-04-01T10:00:00.000Z'),
			updatedAt: new Date('2026-04-03T10:00:00.000Z'),
			allocations: [],
		} as never);

		const result = await service.updateWithdrawalCashLot(
			transaction as never,
			{
				destinationAmount: 130000,
				destinationCurrency: 'ARS',
				exchangeRate: 1300,
			},
			db as never
		);

		expect(db.cashLot.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					withdrawalTransactionId: 11,
					userId: 1,
				},
			})
		);
		expect(db.cashLot.update).toHaveBeenCalledWith({
			where: {
				id: 7,
			},
			data: {
				withdrawalDate: transaction.date,
				sourceAmount: new Decimal(100),
				sourceCurrency: 'USD',
				destinationAmount: new Decimal(130000),
				destinationCurrency: 'ARS',
				exchangeRate: new Decimal(1300),
				remainingAmount: new Decimal(130000),
				migrationStatus: 'linked',
			},
		});
		expect(result).toMatchObject({
			id: 7,
			destinationAmount: new Decimal(130000),
			remainingAmount: new Decimal(130000),
		});
	});

	it('rejects withdrawal date edits when allocations already exist', async () => {
		const transaction: TestTransaction = {
			id: 12,
			userId: 1,
			date: new Date('2026-04-03T10:00:00.000Z'),
			currency: 'USD',
			amount: new Decimal(100),
			originalCurrencyAmount: new Decimal(100),
		} as never;

		db.cashLot.findFirst.mockResolvedValue({
			id: 8,
			userId: 1,
			withdrawalTransactionId: 12,
			withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
			sourceAmount: new Decimal(100),
			sourceCurrency: 'USD',
			destinationAmount: new Decimal(120000),
			destinationCurrency: 'ARS',
			exchangeRate: new Decimal(1200),
			remainingAmount: new Decimal(100000),
			migrationStatus: 'linked',
			createdAt: new Date('2026-04-01T10:00:00.000Z'),
			updatedAt: new Date('2026-04-01T10:00:00.000Z'),
			allocations: [{ id: 1 }],
		} as never);

		await expect(
			service.updateWithdrawalCashLot(
				transaction as never,
				{
					destinationAmount: 120000,
					destinationCurrency: 'ARS',
					exchangeRate: 1200,
				},
				db as never
			)
		).rejects.toMatchObject({
			statusCode: 409,
		});

		expect(db.cashLot.update).not.toHaveBeenCalled();
	});

	it('allocates cash expenses using FIFO and updates remaining cash lots', async () => {
		const transaction: TestTransaction = {
			id: 20,
			userId: 1,
			date: new Date('2026-04-02T12:00:00.000Z'),
			currency: 'ARS',
			amount: new Decimal(150000),
			originalCurrencyAmount: new Decimal(150000),
		} as never;

		db.cashLot.findMany.mockResolvedValue([
			{
				id: 1,
				userId: 1,
				withdrawalTransactionId: 10,
				withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				sourceAmount: new Decimal(100),
				sourceCurrency: 'USD',
				destinationAmount: new Decimal(120000),
				destinationCurrency: 'ARS',
				exchangeRate: new Decimal(1200),
				remainingAmount: new Decimal(120000),
				migrationStatus: 'linked',
				createdAt: new Date('2026-04-01T10:00:00.000Z'),
				updatedAt: new Date('2026-04-01T10:00:00.000Z'),
			},
			{
				id: 2,
				userId: 1,
				withdrawalTransactionId: 11,
				withdrawalDate: new Date('2026-04-02T09:00:00.000Z'),
				sourceAmount: new Decimal(100),
				sourceCurrency: 'USD',
				destinationAmount: new Decimal(100000),
				destinationCurrency: 'ARS',
				exchangeRate: new Decimal(1250),
				remainingAmount: new Decimal(100000),
				migrationStatus: 'linked',
				createdAt: new Date('2026-04-02T09:00:00.000Z'),
				updatedAt: new Date('2026-04-02T09:00:00.000Z'),
			},
		] as never);
		db.cashLot.updateMany.mockResolvedValue({ count: 1 });
		db.cashLotAllocation.create.mockResolvedValue({} as never);

		const result = await service.allocateCashExpense(transaction as never, db as never);

		expect(result).toMatchObject({
			totalAllocated: 150000,
			allocations: [
				{
					cashLotId: 1,
					allocatedAmount: 120000,
					exchangeRate: 1200,
					sourceEquivalentAmount: 100,
				},
				{
					cashLotId: 2,
					allocatedAmount: 30000,
					exchangeRate: 1250,
					sourceEquivalentAmount: 24,
				},
			],
		});
		expect(db.cashLot.updateMany).toHaveBeenCalledTimes(2);
		expect(db.cashLotAllocation.create).toHaveBeenCalledTimes(2);
	});

	it('returns a zero allocation result for zero-amount cash expenses', async () => {
		const transaction: TestTransaction = {
			id: 21,
			userId: 1,
			date: new Date('2026-04-02T12:00:00.000Z'),
			currency: 'ARS',
			amount: new Decimal(0),
			originalCurrencyAmount: new Decimal(0),
		} as never;

		const result = await service.allocateCashExpense(transaction as never, db as never);

		expect(result).toEqual({
			allocations: [],
			totalAllocated: 0,
		});
		expect(db.cashLot.findMany).not.toHaveBeenCalled();
		expect(db.cashLot.updateMany).not.toHaveBeenCalled();
		expect(db.cashLotAllocation.create).not.toHaveBeenCalled();
	});

	it('rejects cash expense allocation when cash balance is insufficient', async () => {
		const transaction: TestTransaction = {
			id: 22,
			userId: 1,
			date: new Date('2026-04-02T12:00:00.000Z'),
			currency: 'ARS',
			amount: new Decimal(25000),
			originalCurrencyAmount: new Decimal(25000),
		} as never;

		db.cashLot.findMany.mockResolvedValue([
			{
				id: 1,
				userId: 1,
				withdrawalTransactionId: 10,
				withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				sourceAmount: new Decimal(100),
				sourceCurrency: 'USD',
				destinationAmount: new Decimal(120000),
				destinationCurrency: 'ARS',
				exchangeRate: new Decimal(1200),
				remainingAmount: new Decimal(20000),
				migrationStatus: 'linked',
				createdAt: new Date('2026-04-01T10:00:00.000Z'),
				updatedAt: new Date('2026-04-01T10:00:00.000Z'),
			},
		] as never);

		await expect(service.allocateCashExpense(transaction as never, db as never)).rejects.toMatchObject({
			statusCode: 422,
		});
		expect(db.cashLot.updateMany).not.toHaveBeenCalled();
		expect(db.cashLotAllocation.create).not.toHaveBeenCalled();
	});

	it('restores cash lots after deleting an expense transaction', async () => {
		db.cashLotAllocation.findMany.mockResolvedValue([
			{
				id: 1,
				userId: 1,
				cashLotId: 10,
				expenseTransactionId: 20,
				allocatedAmount: new Decimal(50000),
				exchangeRate: new Decimal(1200),
				createdAt: new Date('2026-04-02T12:00:00.000Z'),
			},
			{
				id: 2,
				userId: 1,
				cashLotId: 10,
				expenseTransactionId: 20,
				allocatedAmount: new Decimal(25000),
				exchangeRate: new Decimal(1200),
				createdAt: new Date('2026-04-02T12:01:00.000Z'),
			},
		] as never);
		db.cashLot.findMany.mockResolvedValue([
			{
				id: 10,
				userId: 1,
				withdrawalTransactionId: 5,
				withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				sourceAmount: new Decimal(100),
				sourceCurrency: 'USD',
				destinationAmount: new Decimal(120000),
				destinationCurrency: 'ARS',
				exchangeRate: new Decimal(1200),
				remainingAmount: new Decimal(25000),
				migrationStatus: 'linked',
				createdAt: new Date('2026-04-01T10:00:00.000Z'),
				updatedAt: new Date('2026-04-02T12:00:00.000Z'),
			},
		] as never);
		db.cashLot.updateMany.mockResolvedValue({ count: 1 });
		db.cashLotAllocation.deleteMany.mockResolvedValue({ count: 2 });

		const restored = await service.restoreExpenseAllocations(20, 1, db as never);

		expect(restored).toBe(2);
		expect(db.cashLot.updateMany).toHaveBeenCalledWith({
			where: {
				id: 10,
				userId: 1,
				remainingAmount: new Decimal(25000),
			},
			data: {
				remainingAmount: new Decimal(100000),
			},
		});
		expect(db.cashLotAllocation.deleteMany).toHaveBeenCalledWith({
			where: {
				expenseTransactionId: 20,
				userId: 1,
			},
		});
	});

	it('blocks withdrawal deletion when the lot is already used', async () => {
		db.cashLot.findFirst.mockResolvedValue({
			id: 1,
			userId: 1,
			withdrawalTransactionId: 10,
			withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
			sourceAmount: new Decimal(100),
			sourceCurrency: 'USD',
			destinationAmount: new Decimal(120000),
			destinationCurrency: 'ARS',
			exchangeRate: new Decimal(1200),
			remainingAmount: new Decimal(100000),
			migrationStatus: 'linked',
			allocations: [{ id: 1 }],
		} as never);

		await expect(service.deleteWithdrawalCashLot(10, 1, db as never)).rejects.toBeInstanceOf(AppError);
	});
});
