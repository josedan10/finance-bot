import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../src/lib/appError';

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: Request, _res: Response, next: NextFunction) => {
		req.user = { id: 1, email: 'test@example.com', role: 'user' };
		next();
	},
	requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../modules/subscriptions/subscription.service', () => ({
	SubscriptionServiceInstance: {
		detectCandidates: jest.fn(),
		list: jest.fn(),
		confirmCandidate: jest.fn(),
		dismissCandidate: jest.fn(),
		createManual: jest.fn(),
		updateStatus: jest.fn(),
		deleteSubscription: jest.fn(),
	},
}));

import app from '../app';
import { SubscriptionServiceInstance } from '../modules/subscriptions/subscription.service';

const subscriptionService = jest.mocked(SubscriptionServiceInstance);

describe('Subscription API routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('forwards unknown service failures to the sanitized application error handler', async () => {
		subscriptionService.detectCandidates.mockRejectedValue(new Error('database connection password=secret'));

		const response = await request(app).get('/api/subscriptions/candidates');

		expect(response.status).toBe(500);
		expect(response.body).toEqual({ status: 'error', message: 'Internal server error' });
		expect(response.text).not.toContain('password=secret');
	});

	it('preserves operational AppError responses through the centralized handler', async () => {
		subscriptionService.confirmCandidate.mockRejectedValue(new AppError('Subscription candidate not found', 404));

		const response = await request(app).post('/api/subscriptions/candidates/missing/confirm');

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ status: 'fail', message: 'Subscription candidate not found' });
	});

	it('rejects non-numeric manual subscription amounts before calling the service', async () => {
		const response = await request(app)
			.post('/api/subscriptions')
			.send({ name: 'Netflix', monthlyAmount: true, currency: 'USD' });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'Invalid subscription details' });
		expect(subscriptionService.createManual).not.toHaveBeenCalled();
	});
});
