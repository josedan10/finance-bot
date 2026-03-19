import { BudgetRollover } from './budget-rollover.service';
import { prismaMock } from '../database/database.module.mock';
import dayjs from 'dayjs';
import { Decimal } from '@prisma/client/runtime/library';

describe('BudgetRolloverService', () => {
	describe('calculateRollover', () => {
		const categoryId = 1;
		const targetMonth = 4; // April
		const targetYear = 2026;

		it('should carry over a surplus correctly', async () => {
			// Mock category limit
			prismaMock.category.findUnique.mockResolvedValue({
				id: categoryId,
				amountLimit: new Decimal(100),
				isCumulative: true,
			} as any);

			// Mock previous period (March) carry-over
			prismaMock.budgetPeriod.findUnique.mockResolvedValue({
				carryOver: new Decimal(0),
			} as any);

			// Mock March spending: $80
			prismaMock.transaction.aggregate.mockResolvedValue({
				_sum: { amount: new Decimal(80) },
			} as any);

			const carryOver = await BudgetRollover.calculateRollover(categoryId, targetMonth, targetYear);

			// March: $100 limit - $80 spent = $20 carryOver for April
			expect(carryOver).toBe(20);
		});

		it('should include previous carry-over in calculation', async () => {
			prismaMock.category.findUnique.mockResolvedValue({
				id: categoryId,
				amountLimit: new Decimal(100),
			} as any);

			// March had $50 carry-over from February
			prismaMock.budgetPeriod.findUnique.mockResolvedValue({
				carryOver: new Decimal(50),
			} as any);

			// March spent $120
			prismaMock.transaction.aggregate.mockResolvedValue({
				_sum: { amount: new Decimal(120) },
			} as any);

			const carryOver = await BudgetRollover.calculateRollover(categoryId, targetMonth, targetYear);

			// March: ($100 limit + $50 carryOver) - $120 spent = $30 carryOver for April
			expect(carryOver).toBe(30);
		});

		it('should return 0 if there was a deficit (no negative carry-over)', async () => {
			prismaMock.category.findUnique.mockResolvedValue({
				id: categoryId,
				amountLimit: new Decimal(100),
			} as any);

			prismaMock.budgetPeriod.findUnique.mockResolvedValue({
				carryOver: new Decimal(0),
			} as any);

			// March spent $110
			prismaMock.transaction.aggregate.mockResolvedValue({
				_sum: { amount: new Decimal(110) },
			} as any);

			const carryOver = await BudgetRollover.calculateRollover(categoryId, targetMonth, targetYear);

			expect(carryOver).toBe(0);
		});
	});

	describe('getOrCreateCurrentPeriod', () => {
		const categoryId = 2;

		it('should return existing period if it exists', async () => {
			const existingPeriod = { id: 1, categoryId, month: 3, year: 2026, carryOver: new Decimal(10) };
			prismaMock.budgetPeriod.findUnique.mockResolvedValue(existingPeriod as any);

			const result = await BudgetRollover.getOrCreateCurrentPeriod(categoryId, new Date('2026-03-15'));

			expect(result).toEqual(existingPeriod);
			expect(prismaMock.budgetPeriod.create).not.toHaveBeenCalled();
		});

		it('should create a new period with carry-over if it does not exist', async () => {
			prismaMock.budgetPeriod.findUnique.mockResolvedValue(null); // First call: check existing
			prismaMock.category.findUnique.mockResolvedValue({ id: categoryId, isCumulative: true, amountLimit: new Decimal(100), name: 'Pets' } as any);
			
			// Mock rollover calculation (March to April)
			prismaMock.budgetPeriod.findUnique.mockResolvedValueOnce(null) // JIT check
				.mockResolvedValueOnce(null); // Prev period check in calculateRollover
			
			prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { amount: new Decimal(70) } } as any);

			const newPeriod = { id: 2, categoryId, month: 4, year: 2026, carryOver: new Decimal(30) };
			prismaMock.budgetPeriod.create.mockResolvedValue(newPeriod as any);

			const result = await BudgetRollover.getOrCreateCurrentPeriod(categoryId, new Date('2026-04-05'));

			expect(result!.carryOver.toNumber()).toBe(30);
			expect(prismaMock.budgetPeriod.create).toHaveBeenCalledWith(expect.objectContaining({
				data: expect.objectContaining({ carryOver: 30 })
			}));
		});
	});
});
