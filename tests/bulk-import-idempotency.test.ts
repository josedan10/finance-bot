import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { prismaMock } from '../modules/database/database.module.mock';
import { createCategory, createPaymentMethod, createTransaction } from '../prisma/factories';
import { Decimal } from '@prisma/client/runtime/library';

import app from '../app';

// Mock the auth middleware
jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: any, res: any, next: any) => {
		req.user = { id: 1, email: 'test@example.com' };
		next();
	},
	requireRole: (_roles: string[]) => (req: any, res: any, next: any) => {
		req.user = { id: 1, email: 'test@example.com', role: 'admin' };
		next();
	},
}));

describe('Bulk Import Idempotency', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should ignore cancelled-like transactions during bulk import', async () => {
		const response = await request(app)
			.post('/api/transactions/bulk')
			.send({
				transactions: [
					{
						date: '2026-03-18',
						description: 'Payment that never posted',
						amount: 15,
						category: 'Food',
						type: 'expense',
						status: 'cancelled',
					},
				],
			});

		expect(response.status).toBe(201);
		expect(response.body).toEqual([]);
		expect(prismaMock.category.findMany).not.toHaveBeenCalled();
		expect(prismaMock.transaction.create).not.toHaveBeenCalled();
	});

	it('should keep similar transactions that come from the same CSV batch', async () => {
		const category = await createCategory({ id: 1, name: 'Food' });
		const pm = await createPaymentMethod({ id: 1, name: 'Cash' });
		const tx1 = await createTransaction({
			id: 201,
			amount: new Decimal(15),
			description: 'Lunch',
			date: new Date('2026-03-18'),
		});
		const tx2 = await createTransaction({
			id: 202,
			amount: new Decimal(15),
			description: 'Lunch',
			date: new Date('2026-03-18'),
			referenceId: 'ref-2',
		});

		prismaMock.transaction.findMany.mockResolvedValueOnce([]);
		prismaMock.category.findMany.mockResolvedValue([category]);
		prismaMock.paymentMethod.findMany.mockResolvedValue([pm]);
		prismaMock.transaction.create
			.mockResolvedValueOnce(tx1)
			.mockResolvedValueOnce(tx2);

		const transactions = [
			{ date: '2026-03-18', description: 'Lunch', amount: 15, category: 'Food', referenceId: 'ref-1' },
			{ date: '2026-03-18', description: 'Lunch', amount: 15, category: 'Food', referenceId: 'ref-2' },
		];

		const response = await request(app)
			.post('/api/transactions/bulk')
			.send({ transactions });

		expect(response.status).toBe(201);
		expect(response.body).toHaveLength(2);
		expect(prismaMock.transaction.create).toHaveBeenCalledTimes(2);
	});

	it('should prevent duplication when uploading the same CSV batch twice', async () => {
		const category = await createCategory({ id: 1, name: 'Food' });
		const pm = await createPaymentMethod({ id: 1, name: 'Cash' });
		const existingTx = await createTransaction({ 
			id: 101, 
			amount: new Decimal(15), 
			description: 'Lunch', 
			date: new Date('2026-03-18') 
		});
		
		// Setup common mocks
		prismaMock.category.findMany.mockResolvedValue([category]);
		prismaMock.category.findFirst.mockResolvedValue(category);
		prismaMock.paymentMethod.findMany.mockResolvedValue([pm]);
		prismaMock.paymentMethod.findFirst.mockResolvedValue(pm);

		const transactions = [
			{ date: '2026-03-18', description: 'Lunch', amount: 15, category: 'Food' }
		];

		// --- FIRST UPLOAD ---
		// Duplicate check (findMany) returns empty
		prismaMock.transaction.findMany.mockResolvedValueOnce([]); 
		// Create returns the new transaction
		prismaMock.transaction.create.mockResolvedValue(existingTx);

		const response1 = await request(app)
			.post('/api/transactions/bulk')
			.send({ transactions });

		expect(response1.status).toBe(201);
		expect(response1.body).toHaveLength(1);
		expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);

		// --- SECOND UPLOAD ---
		// Duplicate check (findMany) now returns the existing transaction
		prismaMock.transaction.findMany.mockResolvedValueOnce([existingTx]); 

		const response2 = await request(app)
			.post('/api/transactions/bulk')
			.send({ transactions });

		expect(response2.status).toBe(201);
		expect(response2.body).toHaveLength(0); // Should be empty because it was skipped
		
		// THE VERIFICATION: Still only 1 creation call total
		expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1); 
	});
});
