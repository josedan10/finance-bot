import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

import app from '../../app';
import { PrismaModule } from '../database/database.module';

jest.mock('../../src/lib/auth.middleware', () => ({
	requireAuth: (req: Request, _res: Response, next: NextFunction) => {
		req.user = { id: 1, email: 'test@example.com' };
		next();
	},
	requireRole: () => (_req: Request, _res: Response, next: NextFunction) => {
		next();
	},
	requireOnboardingSyncAuth: (req: Request, _res: Response, next: NextFunction) => {
		req.user = { id: 1, email: 'test@example.com' };
		next();
	},
}));

jest.mock('../database/database.module', () => ({
	PrismaModule: {
		dailyExchangeRate: {
			findFirst: jest.fn(),
			findMany: jest.fn(),
		},
		historicalExchangeRate: {
			findFirst: jest.fn(),
		},
	},
}));

const mockPrisma = PrismaModule as unknown as {
	dailyExchangeRate: {
		findFirst: jest.Mock;
		findMany: jest.Mock;
	};
	historicalExchangeRate: {
		findFirst: jest.Mock;
	};
};

describe('Exchange Rates API', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns a limited history ordered from newest to oldest', async () => {
		mockPrisma.dailyExchangeRate.findMany.mockResolvedValue([
			{
				bcvPrice: '120.50',
				monitorPrice: '125.75',
				date: new Date('2026-06-29T00:00:00.000Z'),
			},
			{
				bcvPrice: '118.25',
				monitorPrice: '123.40',
				date: new Date('2026-06-28T00:00:00.000Z'),
			},
		] as never);

		const response = await request(app).get('/api/exchange-rates/history?limit=2');

		expect(response.status).toBe(200);
		expect(response.body).toEqual([
			{ bcv: 120.5, monitor: 125.75, date: '2026-06-29' },
			{ bcv: 118.25, monitor: 123.4, date: '2026-06-28' },
		]);
		expect(mockPrisma.dailyExchangeRate.findMany).toHaveBeenCalledWith({
			orderBy: { date: 'desc' },
			take: 2,
		});
	});
});
