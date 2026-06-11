import { BudgetPeriod, Category, Prisma, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaModule as prisma } from '../database/database.module';
import logger from '../../src/lib/logger';
import {
	BUDGET_OVERFLOW_TRANSFER_REFERENCE_PREFIX,
	isBudgetOverflowTransferTransaction,
} from '../../src/lib/budget-overflow-transfers';

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
			carryOver = await this.calculateRollover(categoryId, category.userId, month, year);
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
	 * Gets or creates budget periods for many categories in a single batch.
	 */
	async getOrCreateCurrentPeriods(categoryIds: number[], date: Date = new Date()) {
		const uniqueCategoryIds = [...new Set(categoryIds)].filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0);
		const periodsByCategoryId = new Map<number, BudgetPeriod>();

		if (uniqueCategoryIds.length === 0) {
			return periodsByCategoryId;
		}

		const month = dayjs(date).month() + 1;
		const year = dayjs(date).year();

		const [existingPeriods, categories] = await Promise.all([
			this._db.budgetPeriod.findMany({
				where: {
					categoryId: { in: uniqueCategoryIds },
					year,
					month,
				},
			}),
			this._db.category.findMany({
				where: { id: { in: uniqueCategoryIds } },
				select: {
					id: true,
					userId: true,
					isCumulative: true,
				},
			}) as Promise<Array<{ id: number; userId: number; isCumulative: boolean }>>,
		]);

		for (const period of existingPeriods) {
			periodsByCategoryId.set(period.categoryId, period);
		}

		const missingCategories = categories.filter((category) => !periodsByCategoryId.has(category.id));
		if (missingCategories.length > 0) {
			const missingPeriodData = [];

			for (const category of missingCategories) {
				let carryOver = 0;
				if (category.isCumulative) {
					carryOver = await this.calculateRollover(category.id, category.userId, month, year);
				}

				missingPeriodData.push({
					categoryId: category.id,
					year,
					month,
					carryOver,
				});
			}

			if (missingPeriodData.length > 0) {
				await this._db.budgetPeriod.createMany({
					data: missingPeriodData,
					skipDuplicates: true,
				});
			}

			const createdPeriods = await this._db.budgetPeriod.findMany({
				where: {
					categoryId: { in: uniqueCategoryIds },
					year,
					month,
				},
			});

			for (const period of createdPeriods) {
				periodsByCategoryId.set(period.categoryId, period);
			}
		}

		return periodsByCategoryId;
	}

	/**
	 * Calculates how much to carry over from the previous period
	 */
	async calculateRollover(
		categoryId: number,
		userId: number,
		targetMonth: number,
		targetYear: number,
		visited = new Set<string>()
	): Promise<number> {
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
		const baseCarryOver = await this.getPreviousCarryOver(category, targetMonth, targetYear, prevPeriod, visited);

		// 3. Calculate total spending in previous month
		const startDate = prevDate.startOf('month').toDate();
		const endDate = prevDate.endOf('month').toDate();

		const transactions = await this._db.transaction.findMany({
			where: {
				userId,
				categoryId,
				cashLot: {
					is: null,
				},
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			select: {
				type: true,
				amount: true,
				referenceId: true,
			},
		});

		const totalSpent = transactions.reduce((sum, transaction) => {
			const amount = Number(transaction.amount ?? 0);
			if (transaction.type === 'expense') {
				return sum + amount;
			}

			if (isBudgetOverflowTransferTransaction(transaction.referenceId)) {
				return sum - amount;
			}

			return sum;
		}, 0);
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

	private async getPreviousCarryOver(
		category: Category,
		targetMonth: number,
		targetYear: number,
		prevPeriod: Pick<BudgetPeriod, 'carryOver'> | null,
		visited = new Set<string>()
	): Promise<number> {
		if (prevPeriod) return Number(prevPeriod.carryOver);
		if (!category.isCumulative) return 0;

		const prevDate = dayjs(`${targetYear}-${targetMonth}-01`).subtract(1, 'month');
		const prevMonth = prevDate.month() + 1;
		const prevYear = prevDate.year();
		const key = `${category.id}:${prevYear}-${prevMonth}`;

		if (visited.has(key)) return 0;

		const hasEarlierActivity = await this.hasBudgetActivityBefore(category.id, category.userId, prevYear, prevMonth);
		if (!hasEarlierActivity) return 0;

		visited.add(key);
		return this.calculateRollover(category.id, category.userId, prevMonth, prevYear, visited);
	}

	private async hasBudgetActivityBefore(categoryId: number, userId: number, year: number, month: number): Promise<boolean> {
		const [olderPeriod, olderTransaction] = await Promise.all([
			this._db.budgetPeriod.findFirst({
				where: {
					categoryId,
					OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
				},
				select: { id: true },
			}),
			this._db.transaction.findFirst({
				where: {
					userId,
					categoryId,
					date: { lt: dayjs(`${year}-${month}-01`).startOf('month').toDate() },
					OR: [
						{
							type: 'expense',
							cashLot: {
								is: null,
							},
						},
							{
								referenceId: {
									startsWith: BUDGET_OVERFLOW_TRANSFER_REFERENCE_PREFIX,
								},
							},
					],
				},
				select: { id: true },
			}),
		]);

		return Boolean(olderPeriod || olderTransaction);
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
			const sourceSurplus = await this.calculateSourceSurplus(rule.sourceCategoryId, userId, targetMonth, targetYear);
			totalIncoming += sourceSurplus;
		}

		return totalIncoming;
	}

	private async calculateSourceSurplus(categoryId: number, userId: number, targetMonth: number, targetYear: number): Promise<number> {
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

		const spending = await this._db.transaction.findMany({
			where: {
				userId,
				categoryId,
				cashLot: {
					is: null,
				},
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			select: {
				type: true,
				amount: true,
				referenceId: true,
			},
		});

		const baseLimit = Number(category.amountLimit);
		const baseCarryOver = await this.getPreviousCarryOver(category, targetMonth, targetYear, prevPeriod);
		const totalSpent = spending.reduce((sum, transaction) => {
			const amount = Number(transaction.amount ?? 0);

			if (transaction.type === 'expense') {
				return sum + amount;
			}

			if (isBudgetOverflowTransferTransaction(transaction.referenceId)) {
				return sum - amount;
			}

			return sum;
		}, 0);
		const surplus = (baseLimit + baseCarryOver) - totalSpent;

		return Math.max(0, surplus);
	}
}

export const BudgetRollover = new BudgetRolloverService();
