import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { CashLotService } from './cash-lot.service';
import { CashLotAllocationService } from './allocation.service';
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
		jest.restoreAllMocks();
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

	it('returns withdrawal lot details by transaction id', async () => {
		db.cashLot.findFirst.mockResolvedValue({
			id: 99,
			userId: 1,
			withdrawalTransactionId: 77,
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
			withdrawalTransaction: null,
		} as never);

		const lot = await service.getWithdrawalLotByTransactionId(77, 1, db as never);

		expect(lot).toMatchObject({
			id: 99,
			withdrawalTransactionId: 77,
		});
		expect(db.cashLot.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					withdrawalTransactionId: 77,
					userId: 1,
				},
			})
		);
	});

	it('returns expense allocations by transaction id', async () => {
		db.cashLotAllocation.findMany.mockResolvedValue([
			{
				id: 1,
				userId: 1,
				cashLotId: 99,
				expenseTransactionId: 88,
				allocatedAmount: new Decimal(5000),
				exchangeRate: new Decimal(1200),
				createdAt: new Date('2026-04-02T10:00:00.000Z'),
				cashLot: {
					id: 99,
					userId: 1,
					withdrawalTransactionId: 77,
					withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
					sourceAmount: new Decimal(100),
					sourceCurrency: 'USD',
					destinationAmount: new Decimal(120000),
					destinationCurrency: 'ARS',
					exchangeRate: new Decimal(1200),
					remainingAmount: new Decimal(115000),
					migrationStatus: 'linked',
					createdAt: new Date('2026-04-01T10:00:00.000Z'),
					updatedAt: new Date('2026-04-02T10:00:00.000Z'),
					withdrawalTransaction: null,
				},
			},
		] as never);

		const allocations = await service.getExpenseAllocations(88, 1, db as never);

		expect(allocations).toHaveLength(1);
		expect(db.cashLotAllocation.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					expenseTransactionId: 88,
					userId: 1,
				},
			})
		);
	});

	it('throws when creating a withdrawal cash lot with non-positive values', async () => {
		const transaction: TestTransaction = {
			id: 13,
			userId: 1,
			date: new Date('2026-04-01T10:00:00.000Z'),
			currency: 'USD',
			amount: new Decimal(100),
			originalCurrencyAmount: new Decimal(100),
		} as never;

		await expect(
			service.createWithdrawalCashLot(
				transaction as never,
				{
					destinationAmount: 0,
					destinationCurrency: 'ARS',
					exchangeRate: 1200,
				},
				db as never
			)
		).rejects.toMatchObject({ statusCode: 400 });
		expect(db.cashLot.create).not.toHaveBeenCalled();
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

	it('creates a withdrawal cash lot when updating and no cash lot exists yet', async () => {
		const transaction: TestTransaction = {
			id: 14,
			userId: 1,
			date: new Date('2026-04-03T10:00:00.000Z'),
			currency: 'USD',
			amount: new Decimal(100),
			originalCurrencyAmount: new Decimal(100),
		} as never;

		db.cashLot.findFirst.mockResolvedValue(null);
		db.cashLot.create.mockResolvedValue({
			id: 15,
			userId: 1,
			withdrawalTransactionId: 14,
			withdrawalDate: transaction.date,
			sourceAmount: new Decimal(100),
			sourceCurrency: 'USD',
			destinationAmount: new Decimal(120000),
			destinationCurrency: 'ARS',
			exchangeRate: new Decimal(1200),
			remainingAmount: new Decimal(120000),
			migrationStatus: 'linked',
			createdAt: transaction.date,
			updatedAt: transaction.date,
		} as never);

		const result = await service.updateWithdrawalCashLot(
			transaction as never,
			{
				destinationAmount: 120000,
				destinationCurrency: 'ARS',
				exchangeRate: 1200,
			},
			db as never
		);

		expect(result).toMatchObject({
			id: 15,
			destinationAmount: new Decimal(120000),
		});
		expect(db.cashLot.create).toHaveBeenCalledTimes(1);
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

	it('throws when a selected cash lot disappears during allocation', async () => {
		const transaction: TestTransaction = {
			id: 23,
			userId: 1,
			date: new Date('2026-04-02T12:00:00.000Z'),
			currency: 'ARS',
			amount: new Decimal(10000),
			originalCurrencyAmount: new Decimal(10000),
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
		] as never);
		db.cashLot.updateMany.mockResolvedValue({ count: 0 });

		await expect(service.allocateCashExpense(transaction as never, db as never)).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(db.cashLotAllocation.create).not.toHaveBeenCalled();
	});

	it('throws when an allocation references a missing lot', async () => {
		const transaction: TestTransaction = {
			id: 24,
			userId: 1,
			date: new Date('2026-04-02T12:00:00.000Z'),
			currency: 'ARS',
			amount: new Decimal(10000),
			originalCurrencyAmount: new Decimal(10000),
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
		] as never);
		jest.spyOn(CashLotAllocationService, 'allocateFifo').mockReturnValue({
			allocations: [
				{
					cashLotId: 999,
					allocatedAmount: 10000,
					exchangeRate: 1200,
					sourceEquivalentAmount: 8.33,
				},
			],
			remainingAmount: 0,
			totalAllocated: 10000,
		});

		await expect(service.allocateCashExpense(transaction as never, db as never)).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(db.cashLot.updateMany).not.toHaveBeenCalled();
		expect(db.cashLotAllocation.create).not.toHaveBeenCalled();
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

	it('returns zero restorations when an expense has no allocations', async () => {
		db.cashLotAllocation.findMany.mockResolvedValue([] as never);

		const restored = await service.restoreExpenseAllocations(999, 1, db as never);

		expect(restored).toBe(0);
		expect(db.cashLot.updateMany).not.toHaveBeenCalled();
		expect(db.cashLotAllocation.deleteMany).not.toHaveBeenCalled();
	});

	it('throws when restoring a cash lot that changed concurrently', async () => {
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
		db.cashLot.updateMany.mockResolvedValue({ count: 0 });

		await expect(service.restoreExpenseAllocations(20, 1, db as never)).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(db.cashLotAllocation.deleteMany).not.toHaveBeenCalled();
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

	it('returns null when trying to delete a withdrawal cash lot that does not exist', async () => {
		db.cashLot.findFirst.mockResolvedValue(null);

		const result = await service.deleteWithdrawalCashLot(999, 1, db as never);

		expect(result).toBeNull();
		expect(db.cashLot.delete).not.toHaveBeenCalled();
	});
});
