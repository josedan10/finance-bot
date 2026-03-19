import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import app from '../app';
import { requireAuth } from '../src/lib/auth.middleware';

// Mock the auth middleware
// This mock will be modified for each test case as needed
const mockRequireAuth = jest.fn((_req: Request, _res: Response, next: NextFunction): Promise<void> => {
	next();
	return Promise.resolve();
});
const mockRequireRole = jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next());

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: mockRequireAuth,
	requireRole: mockRequireRole,
}));

describe('Transaction API (CRUD)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// TDD Scenario 1 (RED): Unauthorized POST /api/transactions
	it('should return 401 if no JWT is provided for POST /api/transactions', async () => {
		// Explicitly make requireAuth NOT call next() and send 401
		(requireAuth as any).mockImplementationOnce((_req: Request, res: Response, _next: NextFunction) => {
			res.sendStatus(401);
		});


		const newTransaction = {
			date: '2026-03-19',
			description: 'Test Transaction',
			amount: 100,
			category: 'Other',
			type: 'expense',
			paymentMethod: 'Cash',
		};

		const response = await request(app)
			.post('/api/transactions')
			.send(newTransaction);

		expect(response.status).toBe(401);
		expect(requireAuth).toHaveBeenCalledTimes(1);
	});
});
