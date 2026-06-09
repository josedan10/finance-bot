import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';
import { createCategory, createKeyword, createPaymentMethod, createTransaction, createUser } from '../prisma/factories';
import { Decimal } from '@prisma/client/runtime/library';
import { requireAuth } from '../src/lib/auth.middleware';

// Mock the auth middleware
jest.mock('../src/lib/auth.middleware', () => {
	const mockRequireAuth = jest.fn((req: any, _res: Response, next: NextFunction) => {
		// Default authorized user for tests
		req.user = { id: 1, email: 'test@example.com' };
		next();
	});
	const mockRequireRole = jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next());

	return {
		requireAuth: mockRequireAuth,
		requireRole: mockRequireRole,
	};
});

describe('Transaction API (CRUD)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// TDD Scenario 1: Unauthorized POST /api/transactions
	it('should return 401 if no JWT is provided', async () => {
		(requireAuth as any).mockImplementationOnce((req: Request, res: Response, _next: NextFunction) => {
			// Un-authenticate for this specific test
			req.user = null as any; 
			res.sendStatus(401);
		});

		const response = await request(app).post('/api/transactions').send({});
		expect(response.status).toBe(401);
	});

	// TDD Scenario 2: User can only see their own transactions
	it('should return only transactions belonging to the authenticated user', async () => {
		const user1 = await createUser({ id: 1 });
		const _user2 = await createUser({ id: 2, email: 'other@user.com' });

		const tx1 = await createTransaction({ id: 1, userId: user1.id, description: 'My Transaction' });

		// Mock the database to return only the filtered transactions
		prismaMock.transaction.findMany.mockResolvedValue([tx1]);

		const response = await request(app).get('/api/transactions');
		
		expect(response.status).toBe(200);
		expect(response.body).toHaveLength(1);
		expect(response.body[0].description).toBe('My Transaction');
		
		// Verify that findMany was called with the correct userId filter
		expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					userId: user1.id,
				}),
			})
		);
	});

	it('should categorize a transaction by updating it instead of deleting it', async () => {
		const category = createCategory({ id: 2, userId: 1, name: 'Food' } as never);
		const paymentMethod = createPaymentMethod({ id: 4, userId: 1, name: 'Cash' } as never);
		const transaction = createTransaction({
			id: 22,
			userId: 1,
			description: 'Lunch',
			amount: new Decimal(14),
			currency: 'USD',
			type: 'debit',
			categoryId: null,
			paymentMethodId: paymentMethod.id,
			referenceId: 'abc-123',
		} as never);
		const updatedTransaction = {
			...transaction,
			categoryId: category.id,
			category,
			paymentMethod,
		};
		const keyword = createKeyword({ id: 7, userId: 1, name: 'lunch' } as never);

		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.transaction.findFirst.mockResolvedValue({
			...transaction,
			category: null,
			paymentMethod,
		} as never);
		prismaMock.transaction.update.mockResolvedValue(updatedTransaction as never);
		prismaMock.keyword.upsert.mockResolvedValue(keyword);
		prismaMock.categoryKeyword.upsert.mockResolvedValue({
			id: 1,
			categoryId: category.id,
			keywordId: keyword.id,
		} as never);

		const response = await request(app)
			.patch('/api/transactions/22/categorize')
			.send({ category: 'Food', keyword: 'lunch' });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: '22',
			description: 'Lunch',
			amount: 14,
			currency: 'USD',
			category: 'Food',
			paymentMethod: 'Cash',
			paymentMethodId: 4,
			type: 'expense',
			referenceId: 'abc-123',
		});
		expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith({
			where: { id: 22, userId: 1 },
			include: {
				category: true,
				paymentMethod: true,
			},
		});
		expect(prismaMock.transaction.update).toHaveBeenCalledWith({
			where: { id: 22 },
			data: expect.objectContaining({
				categoryId: 2,
				reviewed: true,
				reviewedAt: expect.any(Date),
			}),
			include: {
				category: true,
				paymentMethod: true,
			},
		});
		expect(prismaMock.transaction.delete).not.toHaveBeenCalled();
		expect(prismaMock.transaction.deleteMany).not.toHaveBeenCalled();
	});

	it('should reject transaction creation when type is invalid instead of coercing it to debit', async () => {
		const response = await request(app).post('/api/transactions').send({
			date: '2026-03-20',
			description: 'Broken payload',
			amount: 10,
			category: 'Food',
			type: 'garbage',
			currency: 'USD',
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'Missing or invalid required fields' });
		expect(prismaMock.transaction.create).not.toHaveBeenCalled();
	});

	it('should reject transaction creation when type casing is invalid', async () => {
		const response = await request(app).post('/api/transactions').send({
			date: '2026-03-20',
			description: 'Case payload',
			amount: 10,
			category: 'Food',
			type: 'Income',
			currency: 'USD',
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'Missing or invalid required fields' });
		expect(prismaMock.transaction.create).not.toHaveBeenCalled();
	});

	it('should reject transaction creation when googleMapsUrl is invalid', async () => {
		const response = await request(app).post('/api/transactions').send({
			date: '2026-03-20',
			description: 'Coffee',
			amount: 10,
			category: 'Food',
			type: 'expense',
			currency: 'USD',
			googleMapsUrl: 'not-a-url',
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'googleMapsUrl must be a valid URL' });
		expect(prismaMock.transaction.create).not.toHaveBeenCalled();
	});

	it('should allow a simple category change without assigning a keyword', async () => {
		const category = createCategory({ id: 3, userId: 1, name: 'Travel' } as never);
		const paymentMethod = createPaymentMethod({ id: 5, userId: 1, name: 'Card' } as never);
		const transaction = createTransaction({
			id: 31,
			userId: 1,
			description: 'Flight',
			amount: new Decimal(120),
			currency: 'USD',
			type: 'debit',
			paymentMethodId: paymentMethod.id,
		} as never);

		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.transaction.findFirst.mockResolvedValue({
			...transaction,
			category: null,
			paymentMethod,
		} as never);
		prismaMock.transaction.update.mockResolvedValue({
			...transaction,
			category,
			paymentMethod,
		} as never);

		const response = await request(app)
			.patch('/api/transactions/31/categorize')
			.send({ category: 'Travel' });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: '31',
			category: 'Travel',
			propagatedCount: 0,
		});
		expect(prismaMock.keyword.upsert).not.toHaveBeenCalled();
		expect(prismaMock.categoryKeyword.upsert).not.toHaveBeenCalled();
	});

	it('should reject generic payment keywords such as Card before creating mappings', async () => {
		const response = await request(app)
			.patch('/api/transactions/31/categorize')
			.send({ category: 'Food', keyword: 'Card', applyToMatchingTransactions: true });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			message: 'Keyword is too generic for category assignment. Choose a merchant or description-specific keyword.',
		});
		expect(prismaMock.transaction.findFirst).not.toHaveBeenCalled();
		expect(prismaMock.keyword.upsert).not.toHaveBeenCalled();
		expect(prismaMock.categoryKeyword.upsert).not.toHaveBeenCalled();
	});

	it('should return 404 when categorizing a non-existent transaction id', async () => {
		prismaMock.transaction.findFirst.mockResolvedValue(null);

		const response = await request(app)
			.patch('/api/transactions/99999/categorize')
			.send({ category: 'Travel' });

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ message: 'Transaction not found' });
		expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
		expect(prismaMock.category.create).not.toHaveBeenCalled();
		expect(prismaMock.transaction.update).not.toHaveBeenCalled();
	});

	it('should return 404 when categorizing a transaction owned by another user', async () => {
		prismaMock.transaction.findFirst.mockResolvedValue(null);

		const response = await request(app)
			.patch('/api/transactions/77/categorize')
			.send({ category: 'Bills & Utilities' });

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ message: 'Transaction not found' });
		expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith({
			where: { id: 77, userId: 1 },
			include: {
				category: true,
				paymentMethod: true,
			},
		});
		expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
		expect(prismaMock.category.create).not.toHaveBeenCalled();
		expect(prismaMock.transaction.update).not.toHaveBeenCalled();
	});

	it('should propagate categorization to matching transactions when requested', async () => {
		const category = createCategory({ id: 4, userId: 1, name: 'Entertainment' } as never);
		const paymentMethod = createPaymentMethod({ id: 6, userId: 1, name: 'Cash' } as never);
		const transaction = createTransaction({
			id: 41,
			userId: 1,
			description: 'Netflix subscription',
			amount: new Decimal(15),
			currency: 'USD',
			type: 'debit',
			paymentMethodId: paymentMethod.id,
		} as never);
		const keyword = createKeyword({ id: 11, userId: 1, name: 'netflix' } as never);

		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.transaction.findFirst.mockResolvedValue({
			...transaction,
			category: null,
			paymentMethod,
		} as never);
		prismaMock.transaction.update.mockResolvedValue({
			...transaction,
			category,
			paymentMethod,
		} as never);
		prismaMock.keyword.upsert.mockResolvedValue(keyword);
		prismaMock.categoryKeyword.deleteMany.mockResolvedValue({ count: 1 } as never);
		prismaMock.categoryKeyword.upsert.mockResolvedValue({
			id: 12,
			categoryId: category.id,
			keywordId: keyword.id,
		} as never);
		prismaMock.transaction.findMany.mockResolvedValue([
			{ id: 55, description: 'netflix family plan' },
			{ id: 56, description: 'NETFLIX annual charge' },
			{ id: 57, description: 'Spotify premium' },
		] as never);
		prismaMock.transaction.updateMany.mockResolvedValue({ count: 2 } as never);

		const response = await request(app)
			.patch('/api/transactions/41/categorize')
			.send({ category: 'Entertainment', keyword: 'Netflix', applyToMatchingTransactions: true });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			id: '41',
			category: 'Entertainment',
			propagatedCount: 2,
			assignedKeyword: 'netflix',
		});
		expect(prismaMock.categoryKeyword.deleteMany).toHaveBeenCalled();
		expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
			where: {
				userId: 1,
				id: {
					not: 41,
				},
			},
			select: {
				id: true,
				description: true,
			},
		});
		expect(prismaMock.transaction.updateMany).toHaveBeenCalledWith({
			where: {
				userId: 1,
				id: {
					in: [55, 56],
				},
			},
			data: expect.objectContaining({
				categoryId: 4,
				reviewed: true,
				reviewedAt: expect.any(Date),
			}),
		});
	});

	it('should preview reassignment for the latest transactions updated by a wrong keyword', async () => {
		const cardCategory = createCategory({ id: 10, userId: 1, name: 'Card' } as never);
		const foodCategory = createCategory({ id: 11, userId: 1, name: 'Food' } as never);
		const travelCategory = createCategory({ id: 12, userId: 1, name: 'Travel' } as never);
		const cardKeyword = createKeyword({ id: 20, userId: 1, name: 'card' } as never);
		const reviewedAt = new Date('2026-06-04T12:30:00.000Z');
		const olderReviewedAt = new Date('2026-06-04T11:00:00.000Z');

		prismaMock.keyword.findFirst.mockResolvedValue({
			...cardKeyword,
			categoryKeyword: [{ categoryId: cardCategory.id, keywordId: cardKeyword.id, category: cardCategory }],
		} as never);
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 101,
				description: 'Card McDonalds debit',
				categoryId: cardCategory.id,
				category: { name: 'Card' },
				reviewedAt,
			},
			{
				id: 102,
				description: 'Card airline ticket',
				categoryId: cardCategory.id,
				category: { name: 'Card' },
				reviewedAt,
			},
			{
				id: 103,
				description: 'Card older McDonalds debit',
				categoryId: cardCategory.id,
				category: { name: 'Card' },
				reviewedAt: olderReviewedAt,
			},
		] as never);
		prismaMock.category.findMany.mockResolvedValue([
			{
				...cardCategory,
				categoryKeyword: [{ keyword: { name: 'card' } }],
			},
			{
				...foodCategory,
				categoryKeyword: [{ keyword: { name: 'mcdonalds' } }],
			},
			{
				...travelCategory,
				categoryKeyword: [{ keyword: { name: 'airline' } }],
			},
		] as never);

		const response = await request(app)
			.post('/api/transactions/category-keyword/reassign')
			.send({ wrongKeyword: 'Card' });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			wrongKeyword: 'card',
			dryRun: true,
			latestBatchOnly: true,
			latestReviewedAt: reviewedAt.toISOString(),
			matchedTransactionCount: 2,
			reassignedCount: 2,
			unmatchedCount: 0,
			deletedKeywordMapping: false,
		});
		expect(response.body.changes).toEqual([
			expect.objectContaining({
				id: '101',
				previousCategory: 'Card',
				newCategory: 'Food',
				matchedKeyword: 'mcdonalds',
			}),
			expect.objectContaining({
				id: '102',
				previousCategory: 'Card',
				newCategory: 'Travel',
				matchedKeyword: 'airline',
			}),
		]);
		expect(prismaMock.transaction.update).not.toHaveBeenCalled();
	});

	it('should apply reassignment and delete the wrong keyword mapping when dryRun is false', async () => {
		const cardCategory = createCategory({ id: 10, userId: 1, name: 'Card' } as never);
		const foodCategory = createCategory({ id: 11, userId: 1, name: 'Food' } as never);
		const cardKeyword = createKeyword({ id: 20, userId: 1, name: 'card' } as never);
		const reviewedAt = new Date('2026-06-04T12:30:00.000Z');
		const tx = {
			categoryKeyword: {
				deleteMany: jest.fn().mockResolvedValue({ count: 1 } as never),
			},
			transaction: {
				update: jest.fn().mockResolvedValue({} as never),
			},
		};

		prismaMock.keyword.findFirst.mockResolvedValue({
			...cardKeyword,
			categoryKeyword: [{ categoryId: cardCategory.id, keywordId: cardKeyword.id, category: cardCategory }],
		} as never);
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 101,
				description: 'Card McDonalds debit',
				categoryId: cardCategory.id,
				category: { name: 'Card' },
				reviewedAt,
			},
		] as never);
		prismaMock.category.findMany.mockResolvedValue([
			{
				...cardCategory,
				categoryKeyword: [{ keyword: { name: 'card' } }],
			},
			{
				...foodCategory,
				categoryKeyword: [{ keyword: { name: 'mcdonalds' } }],
			},
		] as never);
		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') {
				throw new Error('Expected transaction callback');
			}

			// eslint-disable-next-line n/no-callback-literal
			return callback(tx as never);
		});

		const response = await request(app)
			.post('/api/transactions/category-keyword/reassign')
			.send({ wrongKeyword: 'Card', dryRun: false });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			wrongKeyword: 'card',
			dryRun: false,
			matchedTransactionCount: 1,
			reassignedCount: 1,
			deletedKeywordMapping: true,
		});
		expect(tx.categoryKeyword.deleteMany).toHaveBeenCalledWith({
			where: {
				keywordId: cardKeyword.id,
				category: {
					userId: 1,
				},
			},
		});
		expect(tx.transaction.update).toHaveBeenCalledWith({
			where: { id: 101 },
			data: {
				categoryId: foodCategory.id,
				reviewed: false,
				reviewedAt: null,
			},
		});
	});

	it('should reject reassignment when the wrong keyword is missing', async () => {
		const response = await request(app).post('/api/transactions/category-keyword/reassign').send({});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'wrongKeyword is required and must be 100 characters or fewer' });
		expect(prismaMock.keyword.findFirst).not.toHaveBeenCalled();
	});

	it('should reject transaction updates when locationName is too long', async () => {
		const response = await request(app)
			.patch('/api/transactions/22')
			.send({
				date: '2026-03-20T00:00:00.000Z',
				description: 'Coffee',
				amount: 10,
				currency: 'USD',
				category: 'Food',
				type: 'expense',
				locationName: 'x'.repeat(256),
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'locationName must be 255 characters or fewer' });
		expect(prismaMock.transaction.findFirst).not.toHaveBeenCalled();
		expect(prismaMock.transaction.update).not.toHaveBeenCalled();
	});
});
