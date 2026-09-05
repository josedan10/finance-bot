import { PrismaModule } from '../database/database.module';
import { AppError } from '../../src/lib/appError';

const MAX_CANDIDATE_TRANSACTIONS = 5000;
const MIN_CONSECUTIVE_MONTHS = 3;
const VALID_STATUSES = new Set(['active', 'paused', 'dismissed']);

export type SubscriptionCharge = {
	id: number;
	date: Date;
	description: string | null;
	amount: number;
	currency: string;
};

export type SubscriptionCandidate = {
	candidateKey: string;
	normalizedMerchant: string;
	displayName: string;
	monthlyAmount: number;
	currency: string;
	charges: SubscriptionCharge[];
};

export function normalizeSubscriptionMerchant(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\b\d{3,}\b/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function monthKey(date: Date): number {
	return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function candidateKey(merchant: string, currency: string, amount: number): string {
	return `${merchant}|${currency}|${amount.toFixed(2)}`;
}

function displayName(description: string | null, merchant: string): string {
	const candidate = description?.trim() || merchant;
	return candidate.slice(0, 100);
}

export function getLongestConsecutiveSubscriptionRun(charges: SubscriptionCharge[]): SubscriptionCharge[] {
	const byMonth = new Map<number, SubscriptionCharge>();
	for (const charge of charges) {
		const key = monthKey(charge.date);
		if (byMonth.has(key)) return [];
		byMonth.set(key, charge);
	}

	const sorted = [...byMonth.entries()].sort(([left], [right]) => left - right);
	let longest: SubscriptionCharge[] = [];
	let current: SubscriptionCharge[] = [];
	let previousKey: number | null = null;

	for (const [key, charge] of sorted) {
		current = previousKey === null || key === previousKey + 1 ? [...current, charge] : [charge];
		if (current.length > longest.length) longest = current;
		previousKey = key;
	}

	return longest.length >= MIN_CONSECUTIVE_MONTHS ? longest : [];
}

export class SubscriptionService {
	async detectCandidates(userId: number): Promise<SubscriptionCandidate[]> {
		const transactions = await PrismaModule.transaction.findMany({
			where: {
				userId,
				type: 'expense',
				description: { not: null },
				amount: { not: null },
			},
			select: {
				id: true,
				date: true,
				description: true,
				amount: true,
				originalCurrencyAmount: true,
				currency: true,
			},
			orderBy: { date: 'desc' },
			take: MAX_CANDIDATE_TRANSACTIONS,
		});
		const reviewedSubscriptions = await PrismaModule.subscription.findMany({
			where: { userId, normalizedMerchant: { not: null }, monthlyAmount: { not: null }, currency: { not: null } },
			select: { normalizedMerchant: true, monthlyAmount: true, currency: true },
		});
		const reviewedKeys = new Set(
			reviewedSubscriptions.map((item) => candidateKey(item.normalizedMerchant!, item.currency!, Number(item.monthlyAmount)))
		);
		const groups = new Map<string, { merchant: string; currency: string; amount: number; charges: SubscriptionCharge[] }>();

		for (const transaction of transactions) {
			const merchant = normalizeSubscriptionMerchant(transaction.description ?? '');
			const currency = transaction.currency.trim().toUpperCase();
			const amount = Number(transaction.originalCurrencyAmount ?? transaction.amount);
			if (!merchant || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || amount <= 0) continue;
			const key = candidateKey(merchant, currency, amount);
			const group = groups.get(key) ?? { merchant, currency, amount, charges: [] };
			group.charges.push({
				id: transaction.id,
				date: transaction.date,
				description: transaction.description,
				amount,
				currency,
			});
			groups.set(key, group);
		}

		return [...groups.entries()]
			.filter(([key]) => !reviewedKeys.has(key))
			.map(([key, group]) => {
				const charges = getLongestConsecutiveSubscriptionRun(group.charges);
				return charges.length === 0
					? null
					: {
						candidateKey: key,
						normalizedMerchant: group.merchant,
						displayName: displayName(charges[0].description, group.merchant),
						monthlyAmount: group.amount,
						currency: group.currency,
						charges,
					};
			})
			.filter((candidate): candidate is SubscriptionCandidate => candidate !== null)
			.sort((left, right) => right.charges.at(-1)!.date.getTime() - left.charges.at(-1)!.date.getTime());
	}

	async confirmCandidate(userId: number, key: string, name?: string) {
		const candidate = (await this.detectCandidates(userId)).find((item) => item.candidateKey === key);
		if (!candidate) throw new AppError('Subscription candidate not found', 404);
		const label = (name?.trim() || candidate.displayName).slice(0, 100);

		const subscriptionId = await PrismaModule.$transaction(async (tx) => {
			const existing = await tx.subscription.findFirst({
				where: {
					userId,
					normalizedMerchant: candidate.normalizedMerchant,
					currency: candidate.currency,
					monthlyAmount: candidate.monthlyAmount,
				},
				include: { charges: true },
			});
			const subscription = existing
				? await tx.subscription.update({ where: { id: existing.id }, data: { name: label, status: 'active', type: 'Monthly' } })
				: await tx.subscription.create({
					data: {
						name: label,
						type: 'Monthly',
						monthlyAmount: candidate.monthlyAmount,
						currency: candidate.currency,
						normalizedMerchant: candidate.normalizedMerchant,
						status: 'active',
						userId,
					},
				});
			await tx.subscriptionTransaction.deleteMany({ where: { subscriptionId: subscription.id, userId } });
			await tx.subscriptionTransaction.createMany({
				data: candidate.charges.map((charge) => ({ userId, subscriptionId: subscription.id, transactionId: charge.id })),
			});
			return subscription.id;
		});
		return this.getSubscription(userId, subscriptionId);
	}

	async dismissCandidate(userId: number, key: string) {
		const candidate = (await this.detectCandidates(userId)).find((item) => item.candidateKey === key);
		if (!candidate) throw new AppError('Subscription candidate not found', 404);
		const existing = await PrismaModule.subscription.findFirst({
			where: { userId, normalizedMerchant: candidate.normalizedMerchant, currency: candidate.currency, monthlyAmount: candidate.monthlyAmount },
		});
		if (existing) return PrismaModule.subscription.update({ where: { id: existing.id }, data: { status: 'dismissed' } });
		return PrismaModule.subscription.create({
			data: { name: candidate.displayName, type: 'Monthly', monthlyAmount: candidate.monthlyAmount, currency: candidate.currency, normalizedMerchant: candidate.normalizedMerchant, status: 'dismissed', userId },
		});
	}

	async createManual(userId: number, input: { name: string; monthlyAmount: number; currency: string }) {
		const name = input.name.trim();
		const currency = input.currency.trim().toUpperCase();
		const normalizedMerchant = normalizeSubscriptionMerchant(name);
		if (!name || name.length > 100 || !normalizedMerchant || !Number.isFinite(input.monthlyAmount) || input.monthlyAmount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
			throw new AppError('Invalid subscription details', 400);
		}
		const existing = await PrismaModule.subscription.findFirst({ where: { userId, normalizedMerchant, currency, monthlyAmount: input.monthlyAmount } });
		if (existing) return PrismaModule.subscription.update({ where: { id: existing.id }, data: { name, status: 'active', type: 'Monthly' } });
		return PrismaModule.subscription.create({ data: { name, type: 'Monthly', monthlyAmount: input.monthlyAmount, currency, normalizedMerchant, status: 'active', userId } });
	}

	async updateStatus(userId: number, id: number, status: string) {
		if (!VALID_STATUSES.has(status) || status === 'dismissed') throw new AppError('Invalid subscription status', 400);
		const result = await PrismaModule.subscription.updateMany({ where: { id, userId }, data: { status } });
		if (result.count === 0) throw new AppError('Subscription not found', 404);
		return this.getSubscription(userId, id);
	}

	async deleteSubscription(userId: number, id: number) {
		const result = await PrismaModule.subscription.deleteMany({ where: { id, userId } });
		if (result.count === 0) throw new AppError('Subscription not found', 404);
	}

	async list(userId: number) {
		const subscriptions = await PrismaModule.subscription.findMany({
			where: { userId, monthlyAmount: { not: null }, currency: { not: null }, status: { in: ['active', 'paused'] } },
			include: { charges: { include: { transaction: { select: { id: true, date: true, description: true, originalCurrencyAmount: true, amount: true, currency: true } } }, orderBy: { transaction: { date: 'desc' } } },
			orderBy: [{ status: 'asc' }, { name: 'asc' }],
		});
		const totals = new Map<string, number>();
		for (const subscription of subscriptions) {
			if (subscription.status === 'active') totals.set(subscription.currency!, (totals.get(subscription.currency!) ?? 0) + Number(subscription.monthlyAmount));
		}
		return { subscriptions: subscriptions.map((item) => this.mapSubscription(item)), totals: [...totals.entries()].map(([currency, monthlyTotal]) => ({ currency, monthlyTotal })) };
	}

	private async getSubscription(userId: number, id: number) {
		const subscription = await PrismaModule.subscription.findFirst({
			where: { id, userId },
			include: { charges: { include: { transaction: { select: { id: true, date: true, description: true, originalCurrencyAmount: true, amount: true, currency: true } } }, orderBy: { transaction: { date: 'desc' } } },
		});
		if (!subscription) throw new AppError('Subscription not found', 404);
		return this.mapSubscription(subscription);
	}

	private mapSubscription(subscription: { id: number; name: string; monthlyAmount: unknown; currency: string | null; normalizedMerchant: string | null; status: string; charges: Array<{ transaction: { id: number; date: Date; description: string | null; originalCurrencyAmount: unknown; amount: unknown; currency: string } }> }) {
		return {
			id: String(subscription.id), name: subscription.name, monthlyAmount: Number(subscription.monthlyAmount), currency: subscription.currency ?? 'USD', normalizedMerchant: subscription.normalizedMerchant, status: subscription.status,
			charges: subscription.charges.map(({ transaction }) => ({ id: String(transaction.id), date: transaction.date.toISOString(), description: transaction.description ?? 'No description', amount: Number(transaction.originalCurrencyAmount ?? transaction.amount), currency: transaction.currency })),
		};
	}
}

export const SubscriptionServiceInstance = new SubscriptionService();
