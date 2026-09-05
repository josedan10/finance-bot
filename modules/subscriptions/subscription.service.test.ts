import { describe, expect, it } from '@jest/globals';
import {
	getLongestConsecutiveSubscriptionRun,
	normalizeSubscriptionMerchant,
	type SubscriptionCharge,
} from './subscription.service';

function charge(id: number, date: string): SubscriptionCharge {
	return { id, date: new Date(date), description: 'Netflix', amount: 12.99, currency: 'USD' };
}

describe('subscription detection helpers', () => {
	it('normalizes statement reference noise conservatively', () => {
		expect(normalizeSubscriptionMerchant('  NÉTFLIX.COM 123456  ')).toBe('netflix com');
	});

	it('returns a run when equal charges span three consecutive calendar months', () => {
		const result = getLongestConsecutiveSubscriptionRun([
			charge(1, '2026-01-10T00:00:00.000Z'),
			charge(2, '2026-02-10T00:00:00.000Z'),
			charge(3, '2026-03-10T00:00:00.000Z'),
		]);
		expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
	});

	it('rejects a group with a missing month or duplicate month charge', () => {
		expect(getLongestConsecutiveSubscriptionRun([
			charge(1, '2026-01-10T00:00:00.000Z'),
			charge(2, '2026-02-10T00:00:00.000Z'),
			charge(3, '2026-04-10T00:00:00.000Z'),
		])).toEqual([]);
		expect(getLongestConsecutiveSubscriptionRun([
			charge(1, '2026-01-10T00:00:00.000Z'),
			charge(2, '2026-02-10T00:00:00.000Z'),
			charge(3, '2026-02-20T00:00:00.000Z'),
			charge(4, '2026-03-10T00:00:00.000Z'),
		])).toEqual([]);
	});
});
