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

function createOverflowSplitTransactionMock(params: {
	categories: Array<{
		id: number;
		name: string;
		amountLimit: Decimal | null;
	}>;
	transactions: Array<{
		id: number;
		type: 'expense' | 'income';
		amount: Decimal;
		categoryId: number | null;
		referenceId: string | null;
		description?: string | null;
	}>;
	assignmentId: number;
	sourceCategoryId: number;
	sourceCategoryName: string;
	amount: number;
	allocations: Array<{
		targetCategoryId: number;
		targetCategoryName: string;
		amount: number;
		transactionId: number;
	}>;
	sourceTransactionId: number;
}) {
	const assignmentRecord = {
		id: params.assignmentId,
		userId: 1,
		sourceCategoryId: params.sourceCategoryId,
		targetCategoryId: params.allocations.length === 1 ? params.allocations[0].targetCategoryId : null,
		month: 6,
		year: 2026,
		amount: new Decimal(params.amount),
		sourceTransactionId: params.sourceTransactionId,
	};

	const txMock = {
		category: {
			findMany: jest.fn().mockResolvedValue(params.categories as never),
		},
		budgetOverflowAssignment: {
			findFirst: jest.fn().mockResolvedValue(null as never),
			create: jest.fn().mockResolvedValue({
				...assignmentRecord,
				sourceTransactionId: null,
			} as never),
			update: jest.fn().mockResolvedValue(assignmentRecord as never),
			deleteMany: jest.fn().mockResolvedValue({ count: 1 } as never),
		},
		budgetOverflowAllocation: {
			create: jest.fn().mockImplementation(async (args: unknown) => {
				const typedArgs = args as { data: { targetCategoryId: number; amount: number; targetTransactionId: number } };
				return {
					id: typedArgs.data.targetCategoryId + 1000,
					userId: 1,
					assignmentId: params.assignmentId,
					targetCategoryId: typedArgs.data.targetCategoryId,
					amount: new Decimal(typedArgs.data.amount),
					targetTransactionId: typedArgs.data.targetTransactionId,
				};
			}),
		},
		transaction: {
			findMany: jest.fn().mockResolvedValue(params.transactions as never),
			findFirst: jest.fn().mockResolvedValue(null as never),
			create: jest.fn().mockImplementation(async (args: unknown) => {
				const typedArgs = args as { data: { type?: string; categoryId?: number } };
				return {
					id:
						typedArgs.data.type === 'income'
							? params.sourceTransactionId
							: params.allocations.find((allocation) => allocation.targetCategoryId === typedArgs.data.categoryId)?.transactionId ??
								params.sourceTransactionId + 1,
				};
			}),
			update: jest.fn().mockImplementation(async (args: unknown) => {
				const typedArgs = args as { data: { type?: string; categoryId?: number } };
				return {
					id:
						typedArgs.data.type === 'income'
							? params.sourceTransactionId
							: params.allocations.find((allocation) => allocation.targetCategoryId === typedArgs.data.categoryId)?.transactionId ??
								params.sourceTransactionId + 1,
				};
			}),
			deleteMany: jest.fn().mockResolvedValue({ count: 2 } as never),
		},
	} as unknown as Prisma.TransactionClient;

	return txMock;
}

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
		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback({
					category: {
						updateMany: jest.fn(),
						update: jest.fn().mockResolvedValue(updatedCategory as never),
					},
				});
			})
		);

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
			isDefaultReserve: false,
			dueDay: null,
			targetDate: null,
		});
		expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
			where: { id: 10, userId: 1 },
		});
		expect(prismaMock.category.update).not.toHaveBeenCalled();
		expect(prismaMock.$transaction).toHaveBeenCalled();
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

	it('should mark a reserve budget as the default reserve', async () => {
		const category = createCategory({
			id: 33,
			userId: 1,
			name: 'Emergency reserve',
			amountLimit: new Decimal(100),
			budgetType: 'reserve',
			isDefaultReserve: false,
		});
		const updatedCategory = createCategory({
			...category,
			isDefaultReserve: true,
		});

		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.category.update.mockResolvedValue(updatedCategory);
		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback({
					category: {
						updateMany: jest.fn(),
						findFirst: jest.fn().mockResolvedValue(category as never),
						update: jest.fn().mockResolvedValue(updatedCategory as never),
					},
				});
			})
		);

		const response = await request(app)
			.put('/api/budgets/33')
			.send({ limit: 100, type: 'reserve', isDefaultReserve: true });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: String(updatedCategory.id),
			category: updatedCategory.name,
			limit: 100,
			type: 'reserve',
			isDefaultReserve: true,
		});
	});

	it('should preserve an existing default reserve when the update omits isDefaultReserve', async () => {
		const category = createCategory({
			id: 33,
			userId: 1,
			name: 'Emergency reserve',
			amountLimit: new Decimal(100),
			budgetType: 'reserve',
			isDefaultReserve: true,
		});
		const updatedCategory = createCategory({
			...category,
			isDefaultReserve: true,
		});

		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.category.update.mockResolvedValue(updatedCategory);
		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback({
					category: {
						updateMany: jest.fn(),
						findFirst: jest.fn().mockResolvedValue(category as never),
						update: jest.fn().mockResolvedValue(updatedCategory as never),
					},
				});
			})
		);

		const response = await request(app)
			.put('/api/budgets/33')
			.send({ limit: 100, type: 'reserve' });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: String(updatedCategory.id),
			category: updatedCategory.name,
			limit: 100,
			type: 'reserve',
			isDefaultReserve: true,
		});
	});

	it('should return the backend-calculated monthly budget overview for overflow routing', async () => {
		const bills = createCategory({
			id: 18,
			userId: 1,
			name: 'Bills & Utilities',
			amountLimit: new Decimal(750),
		});
		const education = createCategory({
			id: 15,
			userId: 1,
			name: 'Education',
			amountLimit: new Decimal(100),
		});
		const transportation = createCategory({
			id: 19,
			userId: 1,
			name: 'Transportation',
			amountLimit: new Decimal(150),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[18, { carryOver: new Decimal(0) }],
				[15, { carryOver: new Decimal(0) }],
				[19, { carryOver: new Decimal(0) }],
			]) as never
		);

		prismaMock.category.findMany.mockResolvedValue([
			{
				...bills,
				categoryKeyword: [],
			},
			{
				...education,
				categoryKeyword: [],
			},
			{
				...transportation,
				categoryKeyword: [
					{
						keyword: { name: 'uber' },
					},
				],
			},
		] as never);
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 626,
				type: 'expense',
				amount: new Decimal(579.5),
				categoryId: 18,
				referenceId: null,
				description: 'Bill payment',
			},
			{
				id: 625,
				type: 'expense',
				amount: new Decimal(144),
				categoryId: 18,
				referenceId: null,
				description: 'Another bill',
			},
			{
				id: 627,
				type: 'expense',
				amount: new Decimal(6.7),
				categoryId: 18,
				referenceId: null,
				description: 'Utility charge',
			},
			{
				id: 658,
				type: 'expense',
				amount: new Decimal(1),
				categoryId: 18,
				referenceId: null,
				description: 'Small fee',
			},
			{
				id: 659,
				type: 'expense',
				amount: new Decimal(1),
				categoryId: 18,
				referenceId: null,
				description: 'Small fee',
			},
			{
				id: 660,
				type: 'expense',
				amount: new Decimal(50),
				categoryId: null,
				referenceId: null,
				description: 'Uber to work',
			},
		] as never);

		const response = await request(app).get('/api/budgets/monthly-overview?month=6&year=2026');

		expect(response.status).toBe(200);
		expect(response.body.budgets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					categoryId: 18,
					category: 'Bills & Utilities',
					limit: 750,
					rawSpent: 732.2,
					adjustedSpent: 732.2,
					overage: 0,
					remaining: 17.8,
				}),
				expect.objectContaining({
					categoryId: 15,
					category: 'Education',
					limit: 100,
					rawSpent: 0,
					adjustedSpent: 0,
					overage: 0,
					remaining: 100,
				}),
				expect.objectContaining({
					categoryId: 19,
					category: 'Transportation',
					limit: 150,
					rawSpent: 50,
					adjustedSpent: 50,
					overage: 0,
					remaining: 100,
				}),
			])
		);
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

		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [sourceCategory, targetCategory],
				transactions: [
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
				],
				assignmentId: 7,
				sourceCategoryId: 21,
				sourceCategoryName: 'Food',
				amount: 20,
				allocations: [
					{
						targetCategoryId: 22,
						targetCategoryName: 'Travel',
						amount: 20,
						transactionId: 102,
					},
				],
				sourceTransactionId: 101,
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

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
			amount: 20,
			transferAmount: 20,
			sourceCategoryName: 'Food',
			targetCategoryName: 'Travel',
			incomeTransactionId: 101,
			expenseTransactionId: 102,
			sourceTransactionId: 101,
			allocations: [
				{
					id: 1022,
					targetCategoryId: 22,
					targetCategoryName: 'Travel',
					amount: 20,
					targetTransactionId: 102,
				},
			],
		});
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should split an overflow assignment across multiple budgets', async () => {
		const sourceCategory = createCategory({
			id: 23,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(100),
		});
		const targetCategoryA = createCategory({
			id: 24,
			userId: 1,
			name: 'Travel',
			amountLimit: new Decimal(200),
		});
		const targetCategoryB = createCategory({
			id: 25,
			userId: 1,
			name: 'Transport',
			amountLimit: new Decimal(200),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[23, { carryOver: new Decimal(0) }],
				[24, { carryOver: new Decimal(0) }],
				[25, { carryOver: new Decimal(0) }],
			]) as never
		);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [sourceCategory, targetCategoryA, targetCategoryB],
				transactions: [
					{
						id: 13,
						type: 'expense',
						amount: new Decimal(120),
						categoryId: 23,
						referenceId: null,
					},
					{
						id: 14,
						type: 'expense',
						amount: new Decimal(50),
						categoryId: 24,
						referenceId: null,
					},
					{
						id: 15,
						type: 'expense',
						amount: new Decimal(30),
						categoryId: 25,
						referenceId: null,
					},
				],
				assignmentId: 12,
				sourceCategoryId: 23,
				sourceCategoryName: 'Food',
				amount: 20,
				allocations: [
					{
						targetCategoryId: 24,
						targetCategoryName: 'Travel',
						amount: 12,
						transactionId: 404,
					},
					{
						targetCategoryId: 25,
						targetCategoryName: 'Transport',
						amount: 8,
						transactionId: 405,
					},
				],
				sourceTransactionId: 403,
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({
				sourceCategoryId: 23,
				month: 6,
				year: 2026,
				allocations: [
					{ targetCategoryId: 24, amount: 12 },
					{ targetCategoryId: 25, amount: 8 },
				],
			});

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: 12,
			sourceCategoryId: 23,
			targetCategoryId: null,
			month: 6,
			year: 2026,
			amount: 20,
			transferAmount: 20,
			sourceCategoryName: 'Food',
			targetCategoryName: null,
			incomeTransactionId: 403,
			expenseTransactionId: 404,
			sourceTransactionId: 403,
		});
		expect(response.body.allocations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ targetCategoryId: 24, amount: 12, targetTransactionId: 404 }),
				expect.objectContaining({ targetCategoryId: 25, amount: 8, targetTransactionId: 405 }),
			])
		);
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

		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [sourceCategory, targetCategory],
				transactions: [
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
				],
				assignmentId: 8,
				sourceCategoryId: 31,
				sourceCategoryName: 'Food',
				amount: 30,
				allocations: [
					{
						targetCategoryId: 32,
						targetCategoryName: 'Travel',
						amount: 30,
						transactionId: 202,
					},
				],
				sourceTransactionId: 201,
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({ sourceCategoryId: 31, targetCategoryId: 32, month: 6, year: 2026 });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'The donor budget does not have enough available funds' });
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should allow overflow assignments when source exceeds the base limit but not limit plus carry-over', async () => {
		const sourceCategory = createCategory({
			id: 41,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(100),
		});
		const targetCategory = createCategory({
			id: 42,
			userId: 1,
			name: 'Travel',
			amountLimit: new Decimal(200),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[41, { carryOver: new Decimal(50) }],
				[42, { carryOver: new Decimal(0) }],
			]) as never
		);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [sourceCategory, targetCategory],
				transactions: [
					{
						id: 5,
						type: 'expense',
						amount: new Decimal(120),
						categoryId: 41,
						referenceId: null,
					},
					{
						id: 6,
						type: 'expense',
						amount: new Decimal(50),
						categoryId: 42,
						referenceId: null,
					},
				],
				assignmentId: 8,
				sourceCategoryId: 41,
				sourceCategoryName: 'Food',
				amount: 20,
				allocations: [
					{
						targetCategoryId: 42,
						targetCategoryName: 'Travel',
						amount: 20,
						transactionId: 202,
					},
				],
				sourceTransactionId: 201,
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({ sourceCategoryId: 41, targetCategoryId: 42, month: 6, year: 2026 });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: 8,
			sourceCategoryId: 41,
			targetCategoryId: 42,
			month: 6,
			year: 2026,
			transferAmount: 20,
			sourceCategoryName: 'Food',
			targetCategoryName: 'Travel',
			incomeTransactionId: 201,
			expenseTransactionId: 202,
		});
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should support overflow assignments when the donor budget is selected first', async () => {
		const donorCategory = createCategory({
			id: 51,
			userId: 1,
			name: 'Travel',
			amountLimit: new Decimal(200),
		});
		const recipientCategory = createCategory({
			id: 52,
			userId: 1,
			name: 'Food',
			amountLimit: new Decimal(100),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[51, { carryOver: new Decimal(0) }],
				[52, { carryOver: new Decimal(0) }],
			]) as never
		);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [recipientCategory, donorCategory],
				transactions: [
					{
						id: 9,
						type: 'expense',
						amount: new Decimal(50),
						categoryId: 51,
						referenceId: null,
					},
					{
						id: 10,
						type: 'expense',
						amount: new Decimal(120),
						categoryId: 52,
						referenceId: null,
					},
				],
				assignmentId: 9,
				sourceCategoryId: 52,
				sourceCategoryName: 'Food',
				amount: 20,
				allocations: [
					{
						targetCategoryId: 51,
						targetCategoryName: 'Travel',
						amount: 20,
						transactionId: 302,
					},
				],
				sourceTransactionId: 301,
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({ sourceCategoryId: 51, targetCategoryId: 52, month: 6, year: 2026 });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: 9,
			sourceCategoryId: 52,
			targetCategoryId: 51,
			month: 6,
			year: 2026,
			transferAmount: 20,
			sourceCategoryName: 'Food',
			targetCategoryName: 'Travel',
			incomeTransactionId: 301,
			expenseTransactionId: 302,
		});
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should correctly process a real-world overflow example with an over-budget source and a roomy target', async () => {
		const sourceCategory = createCategory({
			id: 61,
			userId: 1,
			name: 'Bills & Utilities',
			amountLimit: new Decimal(200),
		});
		const targetCategory = createCategory({
			id: 62,
			userId: 1,
			name: 'Education',
			amountLimit: new Decimal(100),
		});

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[61, { carryOver: new Decimal(0) }],
				[62, { carryOver: new Decimal(0) }],
			]) as never
		);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [sourceCategory, targetCategory],
				transactions: [
					{
						id: 11,
						type: 'expense',
						amount: new Decimal(212.19),
						categoryId: 61,
						referenceId: null,
					},
					{
						id: 12,
						type: 'expense',
						amount: new Decimal(6.05),
						categoryId: 62,
						referenceId: null,
					},
				],
				assignmentId: 11,
				sourceCategoryId: 61,
				sourceCategoryName: 'Bills & Utilities',
				amount: 12.19,
				allocations: [
					{
						targetCategoryId: 62,
						targetCategoryName: 'Education',
						amount: 12.19,
						transactionId: 402,
					},
				],
				sourceTransactionId: 401,
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

		const response = await request(app)
			.post('/api/budgets/overflow-assignments')
			.send({ sourceCategoryId: 61, targetCategoryId: 62, month: 6, year: 2026 });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: 11,
			sourceCategoryId: 61,
			targetCategoryId: 62,
			month: 6,
			year: 2026,
			sourceCategoryName: 'Bills & Utilities',
			targetCategoryName: 'Education',
			incomeTransactionId: 401,
			expenseTransactionId: 402,
		});
		expect(response.body.transferAmount).toBeCloseTo(12.19, 2);
		expect(prismaMock.$transaction).toHaveBeenCalled();
	});

	it('should delete the overflow assignment and its transfer transactions', async () => {
		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			const txMock = createOverflowSplitTransactionMock({
				categories: [
					createCategory({
						id: 21,
						userId: 1,
						name: 'Food',
						amountLimit: new Decimal(100),
					}),
					createCategory({
						id: 22,
						userId: 1,
						name: 'Travel',
						amountLimit: new Decimal(200),
					}),
				],
				transactions: [
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
				],
				assignmentId: 21,
				sourceCategoryId: 21,
				sourceCategoryName: 'Food',
				amount: 20,
				allocations: [
					{
						targetCategoryId: 22,
						targetCategoryName: 'Travel',
						amount: 20,
						transactionId: 102,
					},
				],
				sourceTransactionId: 101,
			}) as unknown as Prisma.TransactionClient;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(txMock as any).budgetOverflowAssignment.findFirst.mockResolvedValue({
				id: 21,
				sourceTransactionId: 101,
				allocations: [{ targetTransactionId: 102 }],
			});

			// eslint-disable-next-line n/no-callback-literal
			return callback(txMock);
		});

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
