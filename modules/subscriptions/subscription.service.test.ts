import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { prismaMock } from '../database/database.module.mock';
import {
	getLongestConsecutiveSubscriptionRun,
	normalizeSubscriptionMerchant,
	SubscriptionService,
	type SubscriptionCandidate,
	type SubscriptionCharge,
} from './subscription.service';

function charge(id: number, date: string): SubscriptionCharge {
	return { id, date: new Date(date), description: 'Netflix', amount: 12.99, currency: 'USD' };
}

function candidate(): SubscriptionCandidate {
	return {
		candidateKey: 'netflix|USD|12.99',
		normalizedMerchant: 'netflix',
		displayName: 'Netflix',
		monthlyAmount: 12.99,
		currency: 'USD',
		charges: [
			charge(1, '2026-01-10T00:00:00.000Z'),
			charge(2, '2026-02-10T00:00:00.000Z'),
			charge(3, '2026-03-10T00:00:00.000Z'),
		],
	};
}

function subscription(id = 7, status = 'active') {
	return {
		id,
		name: 'Netflix',
		monthlyAmount: 12.99,
		currency: 'USD',
		normalizedMerchant: 'netflix',
		status,
		charges: [
			{
				transaction: {
					id: 3,
					date: new Date('2026-03-10T00:00:00.000Z'),
					description: 'Netflix March',
					originalCurrencyAmount: null,
					amount: 12.99,
					currency: 'USD',
				},
			},
		],
	};
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
		expect(
			getLongestConsecutiveSubscriptionRun([
				charge(1, '2026-01-10T00:00:00.000Z'),
				charge(2, '2026-02-10T00:00:00.000Z'),
				charge(3, '2026-04-10T00:00:00.000Z'),
			])
		).toEqual([]);
		expect(
			getLongestConsecutiveSubscriptionRun([
				charge(1, '2026-01-10T00:00:00.000Z'),
				charge(2, '2026-02-10T00:00:00.000Z'),
				charge(3, '2026-02-20T00:00:00.000Z'),
				charge(4, '2026-03-10T00:00:00.000Z'),
			])
		).toEqual([]);
	});
});

describe('SubscriptionService', () => {
	let service: SubscriptionService;

	beforeEach(() => {
		service = new SubscriptionService();
	});

	it('detects unreviewed recurring charges and ignores invalid or reviewed groups', async () => {
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 1,
				date: new Date('2026-01-10T00:00:00.000Z'),
				description: 'Netflix 1234',
				amount: 12.99,
				originalCurrencyAmount: null,
				currency: 'usd',
			},
			{
				id: 2,
				date: new Date('2026-02-10T00:00:00.000Z'),
				description: 'Netflix 5678',
				amount: 12.99,
				originalCurrencyAmount: null,
				currency: 'usd',
			},
			{
				id: 3,
				date: new Date('2026-03-10T00:00:00.000Z'),
				description: 'Netflix 9012',
				amount: 12.99,
				originalCurrencyAmount: null,
				currency: 'usd',
			},
			{
				id: 4,
				date: new Date('2026-01-10T00:00:00.000Z'),
				description: 'Sparse service',
				amount: 8,
				originalCurrencyAmount: null,
				currency: 'USD',
			},
			{
				id: 5,
				date: new Date('2026-03-10T00:00:00.000Z'),
				description: 'Sparse service',
				amount: 8,
				originalCurrencyAmount: null,
				currency: 'USD',
			},
			{
				id: 6,
				date: new Date('2026-01-10T00:00:00.000Z'),
				description: '',
				amount: 8,
				originalCurrencyAmount: null,
				currency: 'USD',
			},
			{
				id: 7,
				date: new Date('2026-01-10T00:00:00.000Z'),
				description: 'Bad currency',
				amount: 8,
				originalCurrencyAmount: null,
				currency: 'US',
			},
		] as never);
		prismaMock.subscription.findMany.mockResolvedValue([]);

		await expect(service.detectCandidates(4)).resolves.toEqual([
			expect.objectContaining({
				candidateKey: 'netflix|USD|12.99',
				displayName: 'Netflix 1234',
				monthlyAmount: 12.99,
				currency: 'USD',
			}),
		]);
	});

	it('does not return a candidate that has already been reviewed', async () => {
		prismaMock.transaction.findMany.mockResolvedValue([
			{
				id: 1,
				date: new Date('2026-01-10T00:00:00.000Z'),
				description: 'Netflix',
				amount: 12.99,
				originalCurrencyAmount: null,
				currency: 'USD',
			},
			{
				id: 2,
				date: new Date('2026-02-10T00:00:00.000Z'),
				description: 'Netflix',
				amount: 12.99,
				originalCurrencyAmount: null,
				currency: 'USD',
			},
			{
				id: 3,
				date: new Date('2026-03-10T00:00:00.000Z'),
				description: 'Netflix',
				amount: 12.99,
				originalCurrencyAmount: null,
				currency: 'USD',
			},
		] as never);
		prismaMock.subscription.findMany.mockResolvedValue([
			{ normalizedMerchant: 'netflix', monthlyAmount: 12.99, currency: 'USD' },
		] as never);

		await expect(service.detectCandidates(4)).resolves.toEqual([]);
	});

	it('confirms a candidate, replaces its charge links, and returns the saved subscription', async () => {
		jest.spyOn(service, 'detectCandidates').mockResolvedValue([candidate()]);
		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') throw new Error('Expected transaction callback');
			return callback(prismaMock);
		});
		prismaMock.subscription.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(subscription() as never);
		prismaMock.subscription.create.mockResolvedValue({ id: 7 } as never);

		const result = await service.confirmCandidate(4, candidate().candidateKey, '  Netflix Premium  ');

		expect(prismaMock.subscription.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ name: 'Netflix Premium', status: 'active' }) })
		);
		expect(prismaMock.subscriptionTransaction.deleteMany).toHaveBeenCalledWith({
			where: { subscriptionId: 7, userId: 4 },
		});
		expect(prismaMock.subscriptionTransaction.createMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ transactionId: 1 })]) })
		);
		expect(result).toEqual(expect.objectContaining({ id: '7', charges: [expect.objectContaining({ amount: 12.99 })] }));
	});

	it('updates an existing subscription while confirming a candidate and rejects missing candidates', async () => {
		jest.spyOn(service, 'detectCandidates').mockResolvedValue([candidate()]);
		prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
			if (typeof callback !== 'function') throw new Error('Expected transaction callback');
			return callback(prismaMock);
		});
		prismaMock.subscription.findFirst
			.mockResolvedValueOnce({ id: 7 } as never)
			.mockResolvedValueOnce(subscription() as never);
		prismaMock.subscription.update.mockResolvedValue({ id: 7 } as never);

		await expect(service.confirmCandidate(4, candidate().candidateKey)).resolves.toEqual(
			expect.objectContaining({ id: '7' })
		);
		expect(prismaMock.subscription.update).toHaveBeenCalled();

		jest.spyOn(service, 'detectCandidates').mockResolvedValue([]);
		await expect(service.confirmCandidate(4, 'missing')).rejects.toMatchObject({ statusCode: 404 });
	});

	it('dismisses a candidate by updating an existing record or creating a new record', async () => {
		jest.spyOn(service, 'detectCandidates').mockResolvedValue([candidate()]);
		prismaMock.subscription.findFirst.mockResolvedValueOnce({ id: 7 } as never).mockResolvedValueOnce(null);
		prismaMock.subscription.update.mockResolvedValue(subscription(7, 'dismissed') as never);
		prismaMock.subscription.create.mockResolvedValue(subscription(8, 'dismissed') as never);

		await service.dismissCandidate(4, candidate().candidateKey);
		await service.dismissCandidate(4, candidate().candidateKey);

		expect(prismaMock.subscription.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'dismissed' } });
		expect(prismaMock.subscription.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ status: 'dismissed', userId: 4 }) })
		);
		jest.spyOn(service, 'detectCandidates').mockResolvedValue([]);
		await expect(service.dismissCandidate(4, 'missing')).rejects.toMatchObject({ statusCode: 404 });
	});

	it('validates manual subscriptions and upserts the matching recurring billing record', async () => {
		await expect(service.createManual(4, { name: ' ', monthlyAmount: 0, currency: 'US' })).rejects.toMatchObject({
			statusCode: 400,
		});
		prismaMock.subscription.findFirst.mockResolvedValueOnce({ id: 7 } as never).mockResolvedValueOnce(null);
		prismaMock.subscription.update.mockResolvedValue(subscription() as never);
		prismaMock.subscription.create.mockResolvedValue(subscription(8) as never);

		await service.createManual(4, { name: 'Netflix', monthlyAmount: 12.99, currency: 'usd' });
		await service.createManual(4, { name: 'Spotify', monthlyAmount: 10, currency: 'USD' });

		expect(prismaMock.subscription.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { name: 'Netflix', status: 'active', type: 'Monthly' } })
		);
		expect(prismaMock.subscription.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ normalizedMerchant: 'spotify', currency: 'USD' }) })
		);
	});

	it('updates and deletes only subscriptions owned by the user', async () => {
		await expect(service.updateStatus(4, 7, 'dismissed')).rejects.toMatchObject({ statusCode: 400 });
		prismaMock.subscription.updateMany
			.mockResolvedValueOnce({ count: 0 } as never)
			.mockResolvedValueOnce({ count: 1 } as never);
		await expect(service.updateStatus(4, 7, 'paused')).rejects.toMatchObject({ statusCode: 404 });
		prismaMock.subscription.findFirst.mockResolvedValue(subscription(7, 'paused') as never);
		await expect(service.updateStatus(4, 7, 'paused')).resolves.toEqual(expect.objectContaining({ status: 'paused' }));
		expect(prismaMock.subscription.updateMany).toHaveBeenLastCalledWith({
			where: { id: 7, userId: 4 },
			data: { status: 'paused' },
		});

		prismaMock.subscription.deleteMany
			.mockResolvedValueOnce({ count: 0 } as never)
			.mockResolvedValueOnce({ count: 1 } as never);
		await expect(service.deleteSubscription(4, 7)).rejects.toMatchObject({ statusCode: 404 });
		await expect(service.deleteSubscription(4, 7)).resolves.toBeUndefined();
	});

	it('lists active and paused subscriptions with active monthly totals', async () => {
		prismaMock.subscription.findMany.mockResolvedValue([subscription(7, 'active'), subscription(8, 'paused')] as never);

		await expect(service.list(4)).resolves.toEqual({
			subscriptions: [
				expect.objectContaining({ id: '7', status: 'active' }),
				expect.objectContaining({ id: '8', status: 'paused' }),
			],
			totals: [{ currency: 'USD', monthlyTotal: 12.99 }],
		});
	});
});
