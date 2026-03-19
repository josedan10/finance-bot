import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaModule as prisma } from '../database/database.module';
import logger from '../../src/lib/logger';

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

		// Only carry over positive surplus
		return Math.max(0, surplus);
	}
}

export const BudgetRollover = new BudgetRolloverService();
