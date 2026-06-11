import request from 'supertest';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';

jest.mock('../src/lib/auth.middleware', () => {
	const mockRequireAuth = jest.fn((req: { user?: { id: number; email: string } }, _res: unknown, next: () => void) => {
		req.user = { id: 1, email: 'test@example.com' };
		next();
	});

	return {
		requireAuth: mockRequireAuth,
		requireRole: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
	};
});

/* eslint-disable import/first */
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';

describe('Monthly share status API', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns the active shared summary status for a month', async () => {
		prismaMock.sharedMonthlySummary.findFirst.mockResolvedValue({
			id: 1,
			userId: 1,
			token: 'share-token',
			month: 6,
			year: 2026,
			title: 'June summary',
			revokedAt: null,
			expiresAt: null,
			createdAt: new Date('2026-06-10T12:00:00.000Z'),
			updatedAt: new Date('2026-06-10T12:00:00.000Z'),
		} as never);

		const response = await request(app).get('/api/monthly-summaries/share/status?month=6&year=2026');

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			shared: true,
			month: 6,
			year: 2026,
			token: 'share-token',
			title: 'June summary',
			sharePath: '/share/share-token',
		});
		expect(prismaMock.sharedMonthlySummary.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					userId: 1,
					month: 6,
					year: 2026,
					revokedAt: null,
				},
			})
		);
	});

	it('returns an inactive status when the month has no active share', async () => {
		prismaMock.sharedMonthlySummary.findFirst.mockResolvedValue(null);

		const response = await request(app).get('/api/monthly-summaries/share/status?month=5&year=2026');

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			shared: false,
			month: 5,
			year: 2026,
			token: null,
			sharePath: null,
		});
	});

	it('rejects invalid month and year values', async () => {
		const response = await request(app).get('/api/monthly-summaries/share/status?month=0&year=1999');

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'month must be 1-12 and year must be valid' });
	});
});
