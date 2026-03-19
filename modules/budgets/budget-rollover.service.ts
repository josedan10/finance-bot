import { Prisma, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaModule as prisma } from '../database/database.module';
import logger from '../../src/lib/logger';

interface BudgetFallbackRuleRow {
	id: number;
	userId: number;
	sourceCategoryId: number;
	targetCategoryId: number;
	enabled: boolean;
}

export class BudgetRolloverService {
	private _db: PrismaClient;

	constructor() {
		this._db = prisma;
	}

	/**
	 * Gets the budget period for a specific date (JIT creation if missing)
	 */
	async getOrCreateCurrentPeriod(categoryId: number, date: Date = new Date()) {
		const month = dayjs(date).month() + 1; // 1-12
		const year = dayjs(date).year();

		// 1. Try to find existing period
		let period = await this._db.budgetPeriod.findUnique({
			where: {
				categoryId_year_month: {
					categoryId,
					year,
					month,
				},
			},
		});

		if (period) return period;

		// 2. If not found, check if category is cumulative
		const category = await this._db.category.findUnique({
			where: { id: categoryId },
		});

		if (!category) throw new Error(`Category ${categoryId} not found`);

		// 3. Create rollover from previous month if cumulative
		let carryOver = 0;
		if (category.isCumulative) {
			carryOver = await this.calculateRollover(categoryId, month, year);
		}

		try {
			period = await this._db.budgetPeriod.create({
				data: {
					categoryId,
					year,
					month,
					carryOver,
				},
			});
			logger.info(`Created budget period for category ${category.name} (${month}/${year}) with carryOver: ${carryOver}`);
		} catch (error) {
			// Handle race condition: if another request created it simultaneously
			period = await this._db.budgetPeriod.findUnique({
				where: {
					categoryId_year_month: { categoryId, year, month },
				},
			});
		}

		return period;
	}

	/**
	 * Calculates how much to carry over from the previous period
	 */
	async calculateRollover(categoryId: number, targetMonth: number, targetYear: number): Promise<number> {
		const prevDate = dayjs(`${targetYear}-${targetMonth}-01`).subtract(1, 'month');
		const prevMonth = prevDate.month() + 1;
		const prevYear = prevDate.year();

		// 1. Get the category limit
		const category = await this._db.category.findUnique({
			where: { id: categoryId },
		});
		if (!category || !category.amountLimit) return 0;

		const outgoingRule = await this.getOutgoingFallbackRule(category.userId, categoryId);

		// 2. Get previous period carry-over
		const prevPeriod = await this._db.budgetPeriod.findUnique({
			where: {
				categoryId_year_month: {
					categoryId,
					year: prevYear,
					month: prevMonth,
				},
			},
		});

		const baseLimit = Number(category.amountLimit);
		const baseCarryOver = prevPeriod ? Number(prevPeriod.carryOver) : 0;

		// 3. Calculate total spending in previous month
		const startDate = prevDate.startOf('month').toDate();
		const endDate = prevDate.endOf('month').toDate();

		const spending = await this._db.transaction.aggregate({
			where: {
				categoryId,
				type: 'expense',
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			_sum: {
				amount: true,
			},
		});

		const totalSpent = Number(spending._sum.amount || 0);
		const surplus = (baseLimit + baseCarryOver) - totalSpent;
		const positiveSurplus = Math.max(0, surplus);

		const ownCarryOver =
			category.isCumulative && (!outgoingRule || outgoingRule.targetCategoryId === categoryId) ? positiveSurplus : 0;
		const incomingReassignedSurplus = await this.calculateIncomingFallbackSurplus(
			category.userId,
			categoryId,
			targetMonth,
			targetYear
		);

		return ownCarryOver + incomingReassignedSurplus;
	}

	private async getOutgoingFallbackRule(userId: number, sourceCategoryId: number): Promise<BudgetFallbackRuleRow | null> {
		const result = await this._db.$queryRaw<BudgetFallbackRuleRow[]>(Prisma.sql`
			SELECT id, userId, sourceCategoryId, targetCategoryId, enabled
			FROM BudgetFallbackRule
			WHERE userId = ${userId}
			  AND sourceCategoryId = ${sourceCategoryId}
			  AND enabled = true
			LIMIT 1
		`);

		return result[0] ?? null;
	}

	private async calculateIncomingFallbackSurplus(
		userId: number,
		targetCategoryId: number,
		targetMonth: number,
		targetYear: number
	): Promise<number> {
		const rules = await this._db.$queryRaw<BudgetFallbackRuleRow[]>(Prisma.sql`
			SELECT id, userId, sourceCategoryId, targetCategoryId, enabled
			FROM BudgetFallbackRule
			WHERE userId = ${userId}
			  AND targetCategoryId = ${targetCategoryId}
			  AND enabled = true
		`);

		if (rules.length === 0) return 0;

		let totalIncoming = 0;

		for (const rule of rules) {
			const sourceSurplus = await this.calculateSourceSurplus(rule.sourceCategoryId, targetMonth, targetYear);
			totalIncoming += sourceSurplus;
		}

		return totalIncoming;
	}

	private async calculateSourceSurplus(categoryId: number, targetMonth: number, targetYear: number): Promise<number> {
		const prevDate = dayjs(`${targetYear}-${targetMonth}-01`).subtract(1, 'month');
		const prevMonth = prevDate.month() + 1;
		const prevYear = prevDate.year();

		const category = await this._db.category.findUnique({
			where: { id: categoryId },
		});
		if (!category || !category.amountLimit) return 0;

		const prevPeriod = await this._db.budgetPeriod.findUnique({
			where: {
				categoryId_year_month: {
					categoryId,
					year: prevYear,
					month: prevMonth,
				},
			},
		});

		const startDate = prevDate.startOf('month').toDate();
		const endDate = prevDate.endOf('month').toDate();

		const spending = await this._db.transaction.aggregate({
			where: {
				categoryId,
				type: 'expense',
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			_sum: {
				amount: true,
			},
		});

		const baseLimit = Number(category.amountLimit);
		const baseCarryOver = prevPeriod ? Number(prevPeriod.carryOver) : 0;
		const totalSpent = Number(spending._sum.amount || 0);
		const surplus = (baseLimit + baseCarryOver) - totalSpent;

		return Math.max(0, surplus);
	}
}

export const BudgetRollover = new BudgetRolloverService();
