import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Decimal } from '@prisma/client/runtime/library';
import { DefaultReserve } from './default-reserve.service';
import { prismaMock } from '../database/database.module.mock';

describe('DefaultReserveService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should sync all default reserve categories for the prior month', async () => {
		const categoryMock = prismaMock.category as any;
		const allocationFindUniqueMock = jest.fn() as any;
		const allocationCreateMock = jest.fn() as any;
		const categoryUpdateMock = jest.fn() as any;
		const transactionMock = prismaMock.transaction as any;

		categoryMock.findMany.mockResolvedValue([
			{ id: 88, userId: 2, name: 'Emergency reserve' },
			{ id: 90, userId: 3, name: 'Backup reserve' },
		]);
		categoryMock.findFirst.mockImplementation(async ({ where }: { where: { id: number; userId: number } }) => {
			if (where.id === 88 && where.userId === 2) {
				return {
					id: 88,
					userId: 2,
					name: 'Emergency reserve',
					currentAmount: new Decimal(100),
				};
			}

			return null;
		});

		allocationFindUniqueMock.mockResolvedValue(null);
		allocationCreateMock.mockResolvedValue({
			id: 1,
			userId: 2,
			categoryId: 88,
			month: 5,
			year: 2026,
			amount: new Decimal(240),
		});
		categoryUpdateMock.mockResolvedValue({
			id: 88,
			userId: 2,
			currentAmount: new Decimal(340),
		});

		transactionMock.findMany.mockResolvedValue([
			{ type: 'income', amount: new Decimal(1000), referenceId: null },
			{ type: 'expense', amount: new Decimal(760), referenceId: null },
		]);

		const transactionClientMock = {
			monthlyReserveAllocation: {
				findUnique: allocationFindUniqueMock,
				create: allocationCreateMock,
			},
			category: {
				update: categoryUpdateMock,
			},
		};

		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback(transactionClientMock as any);
			})
		);

		const result = await DefaultReserve.syncDefaultReserveAllocations(new Date('2026-06-15T12:00:00.000Z'));

		expect(result).toHaveLength(1);
		expect(categoryMock.findMany).toHaveBeenCalledWith({
			where: {
				budgetType: 'reserve',
				isDefaultReserve: true,
			},
			select: {
				id: true,
				userId: true,
				name: true,
			},
		});
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should apply monthly surplus to the default reserve once per month', async () => {
		const reserveAllocationMock = prismaMock.monthlyReserveAllocation as any;
		const categoryMock = prismaMock.category as any;
		const transactionMock = prismaMock.transaction as any;
		const allocationFindUniqueMock = jest.fn() as any;
		allocationFindUniqueMock.mockResolvedValue(null);
		const allocationCreateMock = jest.fn() as any;
		allocationCreateMock.mockResolvedValue({
			id: 1,
			userId: 2,
			categoryId: 88,
			month: 5,
			year: 2026,
			amount: new Decimal(240),
		});
		const categoryUpdateMock = jest.fn() as any;
		categoryUpdateMock.mockResolvedValue({
			id: 88,
			userId: 2,
			currentAmount: new Decimal(340),
		});
		const transactionClientMock = {
			monthlyReserveAllocation: {
				findUnique: allocationFindUniqueMock,
				create: allocationCreateMock,
			},
			category: {
				update: categoryUpdateMock,
			},
		};

		reserveAllocationMock.findUnique.mockResolvedValue(null);
		categoryMock.findFirst.mockResolvedValue({
			id: 88,
			userId: 2,
			name: 'Emergency reserve',
			currentAmount: new Decimal(100),
		});
		transactionMock.findMany.mockResolvedValue([
			{ type: 'income', amount: new Decimal(1000), referenceId: null },
			{ type: 'expense', amount: new Decimal(760), referenceId: null },
		]);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback(transactionClientMock as any);
			})
		);

		const result = await DefaultReserve.applyMonthlySurplusToDefaultReserve(2, 88, 5, 2026);

		expect(result).toMatchObject({
			id: 1,
			userId: 2,
			categoryId: 88,
			month: 5,
			year: 2026,
		});
		expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
			where: {
				id: 88,
				userId: 2,
				budgetType: 'reserve',
				isDefaultReserve: true,
			},
			select: {
				id: true,
				name: true,
				currentAmount: true,
			},
		});
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should return the existing allocation when the month has already been synced', async () => {
		const reserveAllocationMock = prismaMock.monthlyReserveAllocation as any;
		const categoryMock = prismaMock.category as any;
		const transactionMock = prismaMock.transaction as any;
		const existingAllocation = {
			id: 9,
			userId: 2,
			categoryId: 88,
			month: 5,
			year: 2026,
			amount: new Decimal(240),
		};

		reserveAllocationMock.findUnique.mockResolvedValue(existingAllocation);
		categoryMock.findFirst.mockResolvedValue({
			id: 88,
			userId: 2,
			name: 'Emergency reserve',
			currentAmount: new Decimal(100),
		});
		transactionMock.findMany.mockResolvedValue([
			{ type: 'income', amount: new Decimal(1000), referenceId: null },
			{ type: 'expense', amount: new Decimal(760), referenceId: null },
		]);

		const result = await DefaultReserve.applyMonthlySurplusToDefaultReserve(2, 88, 5, 2026);

		expect(result).toEqual(existingAllocation);
		expect(prismaMock.$transaction).not.toHaveBeenCalled();
		expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
	});

	it('should skip allocation when the reserve category no longer exists', async () => {
		const reserveAllocationMock = prismaMock.monthlyReserveAllocation as any;
		const categoryMock = prismaMock.category as any;

		reserveAllocationMock.findUnique.mockResolvedValue(null);
		categoryMock.findFirst.mockResolvedValue(null);

		const result = await DefaultReserve.applyMonthlySurplusToDefaultReserve(2, 88, 5, 2026);

		expect(result).toBeNull();
		expect(prismaMock.$transaction).not.toHaveBeenCalled();
	});

	it('should keep the concurrent allocation from the transaction lock path', async () => {
		const reserveAllocationMock = prismaMock.monthlyReserveAllocation as any;
		const categoryMock = prismaMock.category as any;
		const transactionMock = prismaMock.transaction as any;
		const concurrentAllocation = {
			id: 12,
			userId: 2,
			categoryId: 88,
			month: 5,
			year: 2026,
			amount: new Decimal(240),
		};
		const concurrentFindUniqueMock: any = jest.fn();
		concurrentFindUniqueMock.mockResolvedValue(concurrentAllocation);

		reserveAllocationMock.findUnique.mockResolvedValue(null);
		categoryMock.findFirst.mockResolvedValue({
			id: 88,
			userId: 2,
			name: 'Emergency reserve',
			currentAmount: new Decimal(100),
		});
		transactionMock.findMany.mockResolvedValue([
			{ type: 'income', amount: new Decimal(1000), referenceId: null },
			{ type: 'expense', amount: new Decimal(760), referenceId: null },
		]);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
					return callback({
						monthlyReserveAllocation: {
							findUnique: concurrentFindUniqueMock,
							create: jest.fn(),
						},
						category: {
						update: jest.fn(),
					},
				} as any);
			})
		);

		const result = await DefaultReserve.applyMonthlySurplusToDefaultReserve(2, 88, 5, 2026);

		expect(result).toEqual(concurrentAllocation);
	});

	it('should skip allocation when there is no surplus', async () => {
		const reserveAllocationMock = prismaMock.monthlyReserveAllocation as any;
		const categoryMock = prismaMock.category as any;
		const transactionMock = prismaMock.transaction as any;

		reserveAllocationMock.findUnique.mockResolvedValue(null);
		categoryMock.findFirst.mockResolvedValue({
			id: 88,
			userId: 2,
			name: 'Emergency reserve',
			currentAmount: new Decimal(100),
		});
		transactionMock.findMany.mockResolvedValue([
			{ type: 'expense', amount: new Decimal(760), referenceId: null },
		]);

		const result = await DefaultReserve.applyMonthlySurplusToDefaultReserve(2, 88, 5, 2026);

		expect(result).toBeNull();
		expect(prismaMock.$transaction).not.toHaveBeenCalled();
	});

	it('should ignore overflow transfer rows when calculating surplus', async () => {
		const reserveAllocationMock = prismaMock.monthlyReserveAllocation as any;
		const categoryMock = prismaMock.category as any;
		const transactionMock = prismaMock.transaction as any;
		const allocationCreateMock = jest.fn() as any;
		const categoryUpdateMock = jest.fn() as any;
		const ignoreTransferFindUniqueMock: any = jest.fn();
		ignoreTransferFindUniqueMock.mockResolvedValue(null);
		const transactionClientMock = {
			monthlyReserveAllocation: {
				findUnique: ignoreTransferFindUniqueMock,
				create: allocationCreateMock.mockResolvedValue({
					id: 7,
					userId: 2,
					categoryId: 88,
					month: 5,
					year: 2026,
					amount: new Decimal(120),
				}),
			},
			category: {
				update: categoryUpdateMock.mockResolvedValue({
					id: 88,
					userId: 2,
					currentAmount: new Decimal(220),
				}),
			},
		};

		reserveAllocationMock.findUnique.mockResolvedValue(null);
		categoryMock.findFirst.mockResolvedValue({
			id: 88,
			userId: 2,
			name: 'Emergency reserve',
			currentAmount: new Decimal(100),
		});
		transactionMock.findMany.mockResolvedValue([
			{ type: 'income', amount: new Decimal(150), referenceId: null },
			{ type: 'expense', amount: new Decimal(10), referenceId: 'bo:transfer-1' },
			{ type: 'expense', amount: new Decimal(30), referenceId: null },
		]);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback(transactionClientMock as any);
			})
		);

		const result = await DefaultReserve.applyMonthlySurplusToDefaultReserve(2, 88, 5, 2026);

		expect(result).toMatchObject({
			id: 7,
			userId: 2,
			categoryId: 88,
			amount: new Decimal(120),
		});
		expect(categoryUpdateMock).toHaveBeenCalledWith({
			where: { id: 88 },
			data: {
				currentAmount: 220,
			},
		});
	});
});
