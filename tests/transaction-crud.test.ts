import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';
import { createTransaction, createUser } from '../prisma/factories';
import { Decimal } from '@prisma/client/runtime/library';

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
import { requireAuth } from '../src/lib/auth.middleware';

describe('Transaction API (CRUD)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// TDD Scenario 1: Unauthorized POST /api/transactions
	it('should return 401 if no JWT is provided', async () => {
		(requireAuth as any).mockImplementationOnce((req: Request, res: Response, next: NextFunction) => {
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
		const user2 = await createUser({ id: 2, email: 'other@user.com' });

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
});
