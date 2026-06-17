import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { prismaMock } from '../modules/database/database.module.mock';
import { BudgetRollover } from '../modules/budgets/budget-rollover.service';
import { buildSharedMonthlySummary } from '../src/lib/monthly-share-summary';

jest.mock('../modules/budgets/budget-rollover.service', () => ({
	BudgetRollover: {
		getOrCreateCurrentPeriods: jest.fn(),
	},
}));

const mockGetOrCreateCurrentPeriods = BudgetRollover.getOrCreateCurrentPeriods as jest.Mock;

describe('buildSharedMonthlySummary', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('counts keyword-matched transportation expenses in monthly budget metrics', async () => {
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 626,
				type: 'expense',
				amount: new Decimal(579.5),
				categoryId: 18,
				referenceId: null,
				description: 'Bill payment',
				category: { id: 18, name: 'Bills & Utilities' },
			},
			{
				id: 625,
				type: 'expense',
				amount: new Decimal(144),
				categoryId: 18,
				referenceId: null,
				description: 'Another bill',
				category: { id: 18, name: 'Bills & Utilities' },
			},
			{
				id: 627,
				type: 'expense',
				amount: new Decimal(6.7),
				categoryId: 18,
				referenceId: null,
				description: 'Utility charge',
				category: { id: 18, name: 'Bills & Utilities' },
			},
			{
				id: 658,
				type: 'expense',
				amount: new Decimal(1),
				categoryId: 18,
				referenceId: null,
				description: 'Small fee',
				category: { id: 18, name: 'Bills & Utilities' },
			},
			{
				id: 659,
				type: 'expense',
				amount: new Decimal(1),
				categoryId: 18,
				referenceId: null,
				description: 'Small fee',
				category: { id: 18, name: 'Bills & Utilities' },
			},
			{
				id: 660,
				type: 'expense',
				amount: new Decimal(50),
				categoryId: null,
				referenceId: null,
				description: 'Uber to work',
				category: null,
			},
		] as never);

		prismaMock.category.findMany.mockResolvedValue([
			{
				id: 15,
				name: 'Education',
				amountLimit: new Decimal(100),
				categoryKeyword: [],
			},
			{
				id: 18,
				name: 'Bills & Utilities',
				amountLimit: new Decimal(750),
				categoryKeyword: [],
			},
			{
				id: 19,
				name: 'Transportation',
				amountLimit: new Decimal(150),
				categoryKeyword: [
					{
						keyword: { name: 'uber' },
					},
				],
			},
		] as never);

		mockGetOrCreateCurrentPeriods.mockResolvedValue(
			new Map([
				[15, { carryOver: new Decimal(0) }],
				[18, { carryOver: new Decimal(0) }],
				[19, { carryOver: new Decimal(0) }],
			]) as never
		);

		const summary = await buildSharedMonthlySummary(1, 6, 2026, 'token', 'June summary', new Date('2026-06-30T00:00:00Z'), null);

		expect(summary.budgets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					categoryId: 18,
					category: 'Bills & Utilities',
					limit: 750,
					spent: 732.2,
					remaining: 17.8,
				}),
				expect.objectContaining({
					categoryId: 19,
					category: 'Transportation',
					limit: 150,
					spent: 50,
					remaining: 100,
				}),
			])
		);
		expect(summary.topCategories).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					category: 'Bills & Utilities',
					amount: 732.2,
				}),
				expect.objectContaining({
					category: 'Transportation',
					amount: 50,
				}),
			])
		);
	});
});
