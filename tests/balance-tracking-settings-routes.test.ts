import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextFunction, Request, Response } from 'express';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: Request, _res: Response, next: NextFunction) => {
		req.user = { id: 1, email: 'test@example.com', role: 'dev' };
		next();
	},
	requireRole: (_roles: string[]) => (_req: Request, _res: Response, next: NextFunction) => {
		next();
	},
}));

describe('Balance Tracking Settings Routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('defaults balance tracking to enabled when no user value is returned', async () => {
		prismaMock.user.findUnique.mockResolvedValue(null);

		const response = await request(app).get('/api/settings/balance-tracking');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ enabled: true });
	});

	it('returns the persisted balance tracking value', async () => {
		prismaMock.user.findUnique.mockResolvedValue({ balanceTrackingEnabled: false } as never);

		const response = await request(app).get('/api/settings/balance-tracking');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ enabled: false });
		expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
			where: { id: 1 },
			select: { balanceTrackingEnabled: true },
		});
	});

	it('updates balance tracking with a validated boolean value', async () => {
		prismaMock.user.update.mockResolvedValue({ balanceTrackingEnabled: false } as never);

		const response = await request(app)
			.put('/api/settings/balance-tracking')
			.send({ enabled: false });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ enabled: false });
		expect(prismaMock.user.update).toHaveBeenCalledWith({
			where: { id: 1 },
			data: { balanceTrackingEnabled: false },
			select: { balanceTrackingEnabled: true },
		});
	});

	it('rejects non-boolean balance tracking values', async () => {
		const response = await request(app)
			.put('/api/settings/balance-tracking')
			.send({ enabled: 'false' });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ message: 'The enabled setting must be a boolean' });
		expect(prismaMock.user.update).not.toHaveBeenCalled();
	});
});
