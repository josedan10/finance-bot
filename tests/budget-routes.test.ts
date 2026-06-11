import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';
import { createCategory } from '../prisma/factories';
import { Decimal } from '@prisma/client/runtime/library';

jest.mock('../modules/budgets/budget-rollover.service', () => ({
	BudgetRollover: {
		getOrCreateCurrentPeriods: jest.fn(),
	},
}));

const mockGetOrCreateCurrentPeriods = (
	jest.requireMock('../modules/budgets/budget-rollover.service') as {
		BudgetRollover: {
			getOrCreateCurrentPeriods: jest.Mock;
		};
	}
).BudgetRollover.getOrCreateCurrentPeriods;

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: any, _res: any, next: any) => {
		req.user = { id: 1, email: 'test@example.com', role: 'dev' };
		next();
	},
	requireRole: (_roles: string[]) => (_req: any, _res: any, next: any) => {
		next();
	},
}));

describe('Budget Routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should allow an authenticated user to update their own budget', async () => {
		const category = createCategory({
			id: 10,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(200),
		});
		const updatedCategory = createCategory({
			...category,
			amountLimit: new Decimal(350),
		});

		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.category.update.mockResolvedValue(updatedCategory);

		const response = await request(app)
			.put('/api/budgets/10')
			.send({ limit: 350 });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			id: String(updatedCategory.id),
			category: updatedCategory.name,
			limit: 350,
			type: 'spending',
			targetAmount: null,
			currentAmount: null,
			dueDay: null,
			targetDate: null,
		});
		expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
			where: { id: 10, userId: 1 },
		});
		expect(prismaMock.category.update).toHaveBeenCalledWith({
			where: { id: category.id },
			data: { amountLimit: 350 },
		});
	});

	it('should return 404 when the budget category does not belong to the authenticated user', async () => {
		prismaMock.category.findFirst.mockResolvedValue(null);

		const response = await request(app)
			.put('/api/budgets/99')
			.send({ limit: 120 });

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ message: 'Category not found' });
		expect(prismaMock.category.update).not.toHaveBeenCalled();
	});

	it('should create or update an automatic fallback rule for leftover budget reassignment', async () => {
		const sourceCategory = createCategory({ id: 11, userId: 1, name: 'Food' });
		const targetCategory = createCategory({ id: 12, userId: 1, name: 'Travel' });

		prismaMock.category.findMany.mockResolvedValue([sourceCategory, targetCategory]);
		prismaMock.$executeRaw.mockResolvedValue(1 as never);
		prismaMock.$queryRaw.mockResolvedValue([
			{
				id: 1,
				sourceCategoryId: 11,
				sourceCategoryName: 'Food',
				targetCategoryId: 12,
				targetCategoryName: 'Travel',
				enabled: true,
			},
		] as never);

		const response = await request(app)
			.post('/api/budgets/fallback-rules')
			.send({ sourceCategoryId: 11, targetCategoryId: 12, enabled: true });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			id: 1,
			sourceCategoryId: 11,
			sourceCategoryName: 'Food',
			targetCategoryId: 12,
			targetCategoryName: 'Travel',
			enabled: true,
		});
		expect(prismaMock.category.findMany).toHaveBeenCalledWith({
			where: {
				id: { in: [11, 12] },
				userId: 1,
			},
		});
		expect(prismaMock.category.update).toHaveBeenCalledWith({
			where: { id: 11 },
			data: { isCumulative: false },
		});
		expect(prismaMock.$executeRaw).toHaveBeenCalled();
	});

	it('should save an overflow assignment and create matching transfer transactions', async () => {
		const sourceCategory = createCategory({
			id: 21,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(100),
		});
		const targetCategory = createCategory({
			id: 22,
			userId: 1,
			name: 'Travel',
			amountLimit: new Decimal(200),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[21, { carryOver: new Decimal(10) }],
				[22, { carryOver: new Decimal(20) }],
			]) as never
		);

		prismaMock.category.findMany.mockResolvedValue([sourceCategory, targetCategory] as never);
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 1,
				type: 'expense',
				amount: new Decimal(120),
				categoryId: 21,
				referenceId: null,
			},
			{
				id: 2,
				type: 'expense',
				amount: new Decimal(50),
				categoryId: 22,
				referenceId: null,
			},
		] as never);
		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				const transactionMock = {
					findFirst: jest.fn(async (): Promise<{ id: number } | null> => null),
					create: jest.fn(async (args: { data: { type?: string } }) => ({
						id: args.data.type === 'income' ? 101 : 102,
					})),
					update: jest.fn(async () => ({ id: 0 })),
				};

				const txMock = {
					budgetOverflowAssignment: {
						upsert: jest.fn(async (): Promise<{
							id: number;
							userId: number;
							sourceCategoryId: number;
							targetCategoryId: number;
							month: number;
							year: number;
						}> => ({
							id: 7,
							userId: 1,
							sourceCategoryId: 21,
							targetCategoryId: 22,
							month: 6,
							year: 2026,
						})),
					},
					transaction: transactionMock,
				} as unknown as Prisma.TransactionClient;

				// eslint-disable-next-line n/no-callback-literal
				return callback(txMock);
			})
		);

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({ sourceCategoryId: 21, targetCategoryId: 22, month: 6, year: 2026 });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: 7,
			sourceCategoryId: 21,
			targetCategoryId: 22,
			month: 6,
			year: 2026,
			transferAmount: 10,
			sourceCategoryName: 'Food',
			targetCategoryName: 'Travel',
			incomeTransactionId: 101,
			expenseTransactionId: 102,
		});
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should reject overflow assignments when the target budget does not have enough available funds', async () => {
		const sourceCategory = createCategory({
			id: 31,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(100),
		});
		const targetCategory = createCategory({
			id: 32,
			userId: 1,
			name: 'Travel',
			amountLimit: new Decimal(50),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[31, { carryOver: new Decimal(0) }],
				[32, { carryOver: new Decimal(0) }],
			]) as never
		);

		prismaMock.category.findMany.mockResolvedValue([sourceCategory, targetCategory] as never);
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 3,
				type: 'expense',
				amount: new Decimal(130),
				categoryId: 31,
				referenceId: null,
			},
			{
				id: 4,
				type: 'expense',
				amount: new Decimal(40),
				categoryId: 32,
				referenceId: null,
			},
		] as never);

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({ sourceCategoryId: 31, targetCategoryId: 32, month: 6, year: 2026 });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'Target budget does not have enough available funds' });
		expect(prismaMock.$transaction).not.toHaveBeenCalled();
	});

	it('should delete the overflow assignment and its transfer transactions', async () => {
		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				const txMock = {
					budgetOverflowAssignment: {
						deleteMany: jest.fn(async (): Promise<{ count: number }> => ({ count: 1 })),
					},
					transaction: {
						deleteMany: jest.fn(async (): Promise<{ count: number }> => ({ count: 2 })),
					},
				} as unknown as Prisma.TransactionClient;

				// eslint-disable-next-line n/no-callback-literal
				return callback(txMock);
			})
		);

		const response = await request(app)
			.delete('/api/budgets/overflow-assignments/21')
			.query({ month: 6, year: 2026 });

		expect(response.status).toBe(204);
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should reject enabling carry-over when the category already has a fallback rule', async () => {
		const category = createCategory({
			id: 15,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(200),
			isCumulative: false,
		});

		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback({
					category: {
						findFirst: jest.fn().mockResolvedValue(category as never),
						update: jest.fn(),
					},
					budgetFallbackRule: {
						findFirst: jest.fn().mockResolvedValue({ id: 1, sourceCategoryId: 15, enabled: true } as never),
					},
					categoryKeyword: {
						deleteMany: jest.fn(),
						create: jest.fn(),
					},
					keyword: {
						upsert: jest.fn(),
					},
				});
			})
		);

		const response = await request(app)
			.put('/api/categories/15')
			.send({ isCumulative: true });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			message: 'Categories with a fallback rule cannot also carry over leftover budget',
		});
	});
});
