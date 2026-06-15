import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaModule as prisma } from '../database/database.module';
import logger from '../../src/lib/logger';
import { isBudgetOverflowTransferTransaction } from '../../src/lib/budget-overflow-transfers';

type MonthlyReserveAllocationRecord = {
	id: number;
	userId: number;
	categoryId: number;
	month: number;
	year: number;
	amount: Prisma.Decimal;
};

export class DefaultReserveService {
	private _db: PrismaClient;

	constructor() {
		this._db = prisma;
	}

	async syncDefaultReserveAllocations(referenceDate: Date = new Date()) {
		const previousMonthDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
		previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
		const month = previousMonthDate.getUTCMonth() + 1;
		const year = previousMonthDate.getUTCFullYear();

		const defaultReserveCategories = await this._db.category.findMany({
			where: {
				budgetType: 'reserve',
				isDefaultReserve: true,
			},
			select: {
				id: true,
				userId: true,
				name: true,
			},
		});

		const allocations: MonthlyReserveAllocationRecord[] = [];

		for (const category of defaultReserveCategories) {
			const allocation = await this.applyMonthlySurplusToDefaultReserve(category.userId, category.id, month, year);
			if (allocation) {
				allocations.push(allocation);
			}
		}

		return allocations;
	}

	async applyMonthlySurplusToDefaultReserve(
		userId: number,
		categoryId: number,
		month: number,
		year: number
	): Promise<MonthlyReserveAllocationRecord | null> {
		const existingAllocation = await this._db.monthlyReserveAllocation.findUnique({
			where: {
				userId_month_year: {
					userId,
					month,
					year,
				},
			},
		});

		if (existingAllocation) {
			return existingAllocation;
		}

		const category = await this._db.category.findFirst({
			where: {
				id: categoryId,
				userId,
				budgetType: 'reserve',
				isDefaultReserve: true,
			},
			select: {
				id: true,
				name: true,
				currentAmount: true,
			},
		});

		if (!category) {
			return null;
		}

		const { surplus, transactionCount } = await this.calculateMonthlySurplus(userId, month, year);
		if (surplus <= 0) {
			logger.info('Default reserve sync skipped because there is no surplus to allocate', {
				userId,
				categoryId,
				month,
				year,
				transactionCount,
			});
			return null;
		}

		return await this._db.$transaction(async (tx) => {
			const concurrentAllocation = await tx.monthlyReserveAllocation.findUnique({
				where: {
					userId_month_year: {
						userId,
						month,
						year,
					},
				},
			});

			if (concurrentAllocation) {
				return concurrentAllocation;
			}

			const currentAmount = new Prisma.Decimal(category.currentAmount ?? 0);
			await tx.category.update({
				where: { id: category.id },
				data: {
					currentAmount: currentAmount.add(surplus),
				},
			});

			const allocation = await tx.monthlyReserveAllocation.create({
				data: {
					userId,
					categoryId: category.id,
					month,
					year,
					amount: surplus,
				},
			});

			logger.info('Applied default reserve monthly surplus', {
				userId,
				categoryId: category.id,
				month,
				year,
				surplus,
				categoryName: category.name,
			});

			return allocation;
		});
	}

	private async calculateMonthlySurplus(userId: number, month: number, year: number) {
		const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
		const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

		const transactions = await this._db.transaction.findMany({
			where: {
				userId,
				date: {
					gte: monthStart,
					lt: monthEnd,
				},
				cashLot: {
					is: null,
				},
			},
			select: {
				type: true,
				amount: true,
				referenceId: true,
			},
		});

		const visibleTransactions = transactions.filter((transaction) => !isBudgetOverflowTransferTransaction(transaction.referenceId));

		const income = visibleTransactions
			.filter((transaction) => transaction.type === 'income')
			.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

		const expenses = visibleTransactions
			.filter((transaction) => transaction.type === 'expense')
			.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

		return {
			surplus: Math.max(0, Math.round((income - expenses) * 100) / 100),
			transactionCount: visibleTransactions.length,
		};
	}
}

export const DefaultReserve = new DefaultReserveService();
