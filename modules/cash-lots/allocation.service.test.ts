import { describe, expect, it } from '@jest/globals';
import { CashLotAllocationService } from './allocation.service';

describe('CashLotAllocationService', () => {
	it('allocates cash lots using FIFO order', () => {
		const result = CashLotAllocationService.allocateFifo(
			[
				{
					id: 2,
					remainingAmount: 100_000,
					exchangeRate: 1250,
					withdrawalDate: new Date('2026-04-10T10:00:00.000Z'),
				},
				{
					id: 1,
					remainingAmount: 120_000,
					exchangeRate: 1200,
					withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				},
			],
			150_000
		);

		expect(result.remainingAmount).toBe(0);
		expect(result.totalAllocated).toBe(150_000);
		expect(result.allocations).toEqual([
			{
				cashLotId: 1,
				allocatedAmount: 120_000,
				exchangeRate: 1200,
				sourceEquivalentAmount: 100,
			},
			{
				cashLotId: 2,
				allocatedAmount: 30_000,
				exchangeRate: 1250,
				sourceEquivalentAmount: 24,
			},
		]);
	});

	it('returns the remaining amount when the lot balance is insufficient', () => {
		const result = CashLotAllocationService.allocateFifo(
			[
				{
					id: 1,
					remainingAmount: 20_000,
					exchangeRate: 1200,
					withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				},
			],
			25_000
		);

		expect(result.totalAllocated).toBe(20_000);
		expect(result.remainingAmount).toBe(5_000);
		expect(result.allocations).toEqual([
			{
				cashLotId: 1,
				allocatedAmount: 20_000,
				exchangeRate: 1200,
				sourceEquivalentAmount: 16.67,
			},
		]);
	});

	it('breaks same-day tie by lower lot id first', () => {
		const result = CashLotAllocationService.allocateFifo(
			[
				{
					id: 9,
					remainingAmount: 50_000,
					exchangeRate: 1_200,
					withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				},
				{
					id: 3,
					remainingAmount: 50_000,
					exchangeRate: 1_250,
					withdrawalDate: new Date('2026-04-01T10:00:00.000Z'),
				},
			],
			60_000
		);

		expect(result.totalAllocated).toBe(60_000);
		expect(result.remainingAmount).toBe(0);
		expect(result.allocations).toEqual([
			{
				cashLotId: 3,
				allocatedAmount: 50_000,
				exchangeRate: 1_250,
				sourceEquivalentAmount: 40,
			},
			{
				cashLotId: 9,
				allocatedAmount: 10_000,
				exchangeRate: 1_200,
				sourceEquivalentAmount: 8.33,
			},
		]);
	});
});
