import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Decimal } from '@prisma/client/runtime/library';
import { DefaultReserve } from './default-reserve.service';
import { prismaMock } from '../database/database.module.mock';

describe('DefaultReserveService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
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
});
