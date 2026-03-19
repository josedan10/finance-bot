import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import app from '../app';
import { prismaMock } from '../modules/database/database.module.mock';
import { createCategory } from '../prisma/factories';
import { Decimal } from '@prisma/client/runtime/library';

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: any, _res: any, next: any) => {
		req.user = { id: 1, email: 'test@example.com' };
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

		const response = await request(app)
			.put('/api/budgets/10')
			.send({ limit: 350 });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			id: String(updatedCategory.id),
			category: updatedCategory.name,
			limit: 350,
		});
		expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
			where: { id: 10, userId: 1 },
		});
		expect(prismaMock.category.update).toHaveBeenCalledWith({
			where: { id: category.id },
			data: { amountLimit: 350 },
		});
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
		expect(prismaMock.$executeRaw).toHaveBeenCalled();
	});
});
