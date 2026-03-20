import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';
import { createCategory } from '../prisma/factories';

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: any, _res: any, next: any) => {
		req.user = { id: 1, email: 'test@example.com' };
		next();
	},
}));

describe('Category Routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should create a category with a selected icon', async () => {
		const createdCategory = createCategory({
			id: 1,
			userId: 1,
			name: 'Food',
			description: 'Meals',
			icon: 'utensils',
		} as never);

		prismaMock.$transaction.mockImplementation(async (callback: unknown) =>
			Promise.resolve().then(() => {
				if (typeof callback !== 'function') {
					throw new Error('Expected transaction callback');
				}

				// eslint-disable-next-line n/no-callback-literal
				return callback({
					category: {
						create: jest.fn().mockResolvedValue(createdCategory as never),
					},
					keyword: {
						upsert: jest.fn(),
					},
					categoryKeyword: {
						create: jest.fn(),
					},
				});
			})
		);

		const response = await request(app)
			.post('/api/categories')
			.send({ name: 'Food', description: 'Meals', icon: 'utensils', keywords: [] });

		expect(response.status).toBe(201);
		expect(response.body.icon).toBe('utensils');
	});
});
