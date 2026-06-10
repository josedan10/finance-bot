import { describe, expect, it, jest } from '@jest/globals';
import { Decimal } from '@prisma/client/runtime/library';
import { CashLotService } from './cash-lot.service';
import { AppError } from '../../src/lib/appError';

type AsyncMock = jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;

interface CashLotDbMock {
	cashLot: {
		create: AsyncMock;
		findFirst: AsyncMock;
		findMany: AsyncMock;
		update: AsyncMock;
		delete: AsyncMock;
	};
	cashLotAllocation: {
		create: AsyncMock;
		findMany: AsyncMock;
		deleteMany: AsyncMock;
	};
}

function createDbMock(): CashLotDbMock {
	return {
		cashLot: {
			create: jest.fn() as AsyncMock,
			findFirst: jest.fn() as AsyncMock,
			findMany: jest.fn() as AsyncMock,
			update: jest.fn() as AsyncMock,
			delete: jest.fn() as AsyncMock,
		},
		cashLotAllocation: {
			create: jest.fn() as AsyncMock,
			findMany: jest.fn() as AsyncMock,
			deleteMany: jest.fn() as AsyncMock,
		},
	};
}

type TestTransaction = {
	id: number;
	userId: number;
	date: Date;
	currency: string;
	amount: Decimal;
	originalCurrencyAmount: Decimal;
};

describe('CashLotService', () => {
	it('creates a withdrawal cash lot with the destination remaining amount', async () => {
		const service = new CashLotService();
		const db = createDbMock() as CashLotDbMock;
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
		});

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

	it('allocates cash expenses using FIFO and updates remaining cash lots', async () => {
		const service = new CashLotService();
		const db = createDbMock() as CashLotDbMock;
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
				remainingAmount: new Decimal(120000),
				exchangeRate: new Decimal(1200),
				withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
			},
			{
				id: 2,
				remainingAmount: new Decimal(100000),
				exchangeRate: new Decimal(1250),
				withdrawalDate: new Date('2026-04-02T09:00:00.000Z'),
			},
		]);
		db.cashLot.update.mockResolvedValue({});
		db.cashLotAllocation.create.mockResolvedValue({});

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
		expect(db.cashLot.update).toHaveBeenCalledTimes(2);
		expect(db.cashLotAllocation.create).toHaveBeenCalledTimes(2);
	});

	it('restores cash lots after deleting an expense transaction', async () => {
		const service = new CashLotService();
		const db = createDbMock() as CashLotDbMock;

		db.cashLotAllocation.findMany.mockResolvedValue([
			{
				id: 1,
				userId: 1,
				cashLotId: 10,
				expenseTransactionId: 20,
				allocatedAmount: new Decimal(50000),
				exchangeRate: new Decimal(1200),
			},
			{
				id: 2,
				userId: 1,
				cashLotId: 10,
				expenseTransactionId: 20,
				allocatedAmount: new Decimal(25000),
				exchangeRate: new Decimal(1200),
			},
		]);
		db.cashLot.findMany.mockResolvedValue([
			{
				id: 10,
				userId: 1,
				remainingAmount: new Decimal(25000),
			},
		]);
		db.cashLot.update.mockResolvedValue({});
		db.cashLotAllocation.deleteMany.mockResolvedValue({ count: 2 });

		const restored = await service.restoreExpenseAllocations(20, 1, db as never);

		expect(restored).toBe(2);
		expect(db.cashLot.update).toHaveBeenCalledWith({
			where: { id: 10 },
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
		const service = new CashLotService();
		const db = createDbMock() as CashLotDbMock;

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
		});

		await expect(service.deleteWithdrawalCashLot(10, 1, db as never)).rejects.toBeInstanceOf(AppError);
	});
});
