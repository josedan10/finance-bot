import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: any, _res: any, next: any) => {
		req.user = { id: 1, email: 'test@example.com' };
		next();
	},
}));

describe('Dashboard Budget Preferences Routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns default preferences when the user has not saved any', async () => {
		prismaMock.user.findUnique.mockResolvedValue({
			dashboardBudgetPreferences: null,
		} as never);

		const response = await request(app).get('/api/dashboard/budget-preferences');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			sortBy: 'manual',
			hiddenBudgetIds: [],
			manualBudgetOrderIds: [],
		});
		expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
			where: { id: 1 },
			select: { dashboardBudgetPreferences: true },
		});
	});

	it('updates dashboard preferences with sanitized ids and preserves current values for omitted fields', async () => {
		prismaMock.user.findUnique.mockResolvedValue({
			dashboardBudgetPreferences: {
				sortBy: 'name',
				hiddenBudgetIds: [2],
				manualBudgetOrderIds: [3, 1, 2],
			},
		} as never);

		prismaMock.user.update.mockResolvedValue({
			id: 1,
			dashboardBudgetPreferences: {
				sortBy: 'name',
				hiddenBudgetIds: [5],
				manualBudgetOrderIds: [7, 3],
			},
		} as never);

		const response = await request(app)
			.put('/api/dashboard/budget-preferences')
			.send({
				hiddenBudgetIds: [5, 5, -1, 'bad'],
				manualBudgetOrderIds: [7, 3, 7, 0],
			});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			sortBy: 'name',
			hiddenBudgetIds: [5],
			manualBudgetOrderIds: [7, 3],
		});
		expect(prismaMock.user.update).toHaveBeenCalledWith({
			where: { id: 1 },
			data: {
				dashboardBudgetPreferences: {
					sortBy: 'name',
					hiddenBudgetIds: [5],
					manualBudgetOrderIds: [7, 3],
				},
			},
		});
	});

	it('accepts explicit sort updates', async () => {
		prismaMock.user.findUnique.mockResolvedValue({
			dashboardBudgetPreferences: {
				sortBy: 'manual',
				hiddenBudgetIds: [],
				manualBudgetOrderIds: [1, 2, 3],
			},
		} as never);

		prismaMock.user.update.mockResolvedValue({
			id: 1,
			dashboardBudgetPreferences: {
				sortBy: 'most-spent',
				hiddenBudgetIds: [],
				manualBudgetOrderIds: [1, 2, 3],
			},
		} as never);

		const response = await request(app)
			.put('/api/dashboard/budget-preferences')
			.send({ sortBy: 'most-spent' });

		expect(response.status).toBe(200);
		expect(response.body.sortBy).toBe('most-spent');
	});
});
