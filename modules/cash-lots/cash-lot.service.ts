import { CashLot, CashLotAllocation, Prisma, PrismaClient, Transaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaModule } from '../database/database.module';
import { AppError } from '../../src/lib/appError';
import logger from '../../src/lib/logger';
import { CashLotAllocationService, type CashLotSourceRow } from './allocation.service';

type DbClient = PrismaClient | Prisma.TransactionClient;

type TransactionLike = Transaction & {
	cashLot?: CashLot | null;
	cashLotAllocations?: CashLotAllocation[];
};

function roundMoney(value: number): number {
	return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundRate(value: number): number {
	return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;
}

function toNumber(value: Decimal | number | null | undefined): number {
	if (value === null || value === undefined) {
		return 0;
	}

	return Number(value);
}

function normalizeCurrency(currency: string): string {
	return currency.trim().toUpperCase();
}

export class CashLotService {
	private _db: PrismaClient;

	constructor() {
		this._db = PrismaModule;
	}

	private get db() {
		return this._db;
	}

	async getWithdrawalLotByTransactionId(transactionId: number, userId: number, db: DbClient = this.db) {
		return db.cashLot.findFirst({
			where: {
				withdrawalTransactionId: transactionId,
				userId,
			},
			include: {
				allocations: {
					orderBy: {
						createdAt: 'asc',
					},
				},
				withdrawalTransaction: {
					include: {
						category: true,
						paymentMethod: true,
					},
				},
			},
		});
	}

	async getExpenseAllocations(expenseTransactionId: number, userId: number, db: DbClient = this.db) {
		return db.cashLotAllocation.findMany({
			where: {
				expenseTransactionId,
				userId,
			},
			include: {
				cashLot: {
					include: {
						withdrawalTransaction: {
							include: {
								category: true,
								paymentMethod: true,
							},
						},
					},
				},
			},
			orderBy: {
				createdAt: 'asc',
			},
		});
	}

	async createWithdrawalCashLot(
		transaction: TransactionLike,
		args: {
			destinationAmount: number;
			destinationCurrency: string;
			exchangeRate: number;
			migrationStatus?: 'linked' | 'unlinked';
		},
		db: DbClient = this.db
	) {
		const sourceAmount = roundMoney(toNumber(transaction.originalCurrencyAmount ?? transaction.amount));
		const sourceCurrency = normalizeCurrency(transaction.currency);
		const destinationAmount = roundMoney(args.destinationAmount);
		const destinationCurrency = normalizeCurrency(args.destinationCurrency);
		const exchangeRate = roundRate(args.exchangeRate);

		if (sourceAmount <= 0 || destinationAmount <= 0 || exchangeRate <= 0) {
			throw new AppError('Withdrawal cash lot requires positive source amount, destination amount and exchange rate', 400);
		}

		return db.cashLot.create({
			data: {
				userId: transaction.userId,
				withdrawalTransactionId: transaction.id,
				withdrawalDate: transaction.date,
				sourceAmount,
				sourceCurrency,
				destinationAmount,
				destinationCurrency,
				exchangeRate,
				remainingAmount: destinationAmount,
				migrationStatus: args.migrationStatus ?? 'linked',
			},
		});
	}

	async updateWithdrawalCashLot(
		transaction: TransactionLike,
		args: {
			destinationAmount: number;
			destinationCurrency: string;
			exchangeRate: number;
			migrationStatus?: 'linked' | 'unlinked';
		},
		db: DbClient = this.db
	) {
		const existingCashLot = await db.cashLot.findFirst({
			where: {
				withdrawalTransactionId: transaction.id,
				userId: transaction.userId,
			},
			include: {
				allocations: true,
			},
		});

		if (!existingCashLot) {
			return this.createWithdrawalCashLot(transaction, args, db);
		}

		const sourceAmount = roundMoney(toNumber(transaction.originalCurrencyAmount ?? transaction.amount));
		const sourceCurrency = normalizeCurrency(transaction.currency);
		const destinationAmount = roundMoney(args.destinationAmount);
		const destinationCurrency = normalizeCurrency(args.destinationCurrency);
		const exchangeRate = roundRate(args.exchangeRate);

		if (sourceAmount <= 0 || destinationAmount <= 0 || exchangeRate <= 0) {
			throw new AppError('Withdrawal cash lot requires positive source amount, destination amount and exchange rate', 400);
		}

		const hasAllocations = existingCashLot.allocations.length > 0;
		const hasCoreChanges =
			roundMoney(toNumber(existingCashLot.sourceAmount)) !== sourceAmount ||
			normalizeCurrency(existingCashLot.sourceCurrency) !== sourceCurrency ||
			roundMoney(toNumber(existingCashLot.destinationAmount)) !== destinationAmount ||
			normalizeCurrency(existingCashLot.destinationCurrency) !== destinationCurrency ||
			roundRate(toNumber(existingCashLot.exchangeRate)) !== exchangeRate;

		if (hasAllocations && hasCoreChanges) {
			throw new AppError('This withdrawal already has cash expenses linked to it and cannot be modified', 409);
		}

		return db.cashLot.update({
			where: { id: existingCashLot.id },
			data: {
				withdrawalDate: transaction.date,
				sourceAmount: new Decimal(sourceAmount),
				sourceCurrency,
				destinationAmount: new Decimal(destinationAmount),
				destinationCurrency,
				exchangeRate: new Decimal(exchangeRate),
				remainingAmount: hasAllocations ? existingCashLot.remainingAmount : new Decimal(destinationAmount),
				migrationStatus: args.migrationStatus ?? existingCashLot.migrationStatus,
			},
		});
	}

	async allocateCashExpense(transaction: TransactionLike, db: DbClient = this.db) {
		const expenseAmount = roundMoney(toNumber(transaction.originalCurrencyAmount ?? transaction.amount));
		const expenseCurrency = normalizeCurrency(transaction.currency);

		if (expenseAmount <= 0) {
			return {
				allocations: [] as Array<{ cashLotId: number; allocatedAmount: number; exchangeRate: number; sourceEquivalentAmount: number }>,
				totalAllocated: 0,
			};
		}

		const availableLots = await db.cashLot.findMany({
			where: {
				userId: transaction.userId,
				destinationCurrency: expenseCurrency,
				migrationStatus: 'linked',
				remainingAmount: {
					gt: 0,
				},
				withdrawalDate: {
					lte: transaction.date,
				},
			},
			orderBy: [
				{ withdrawalDate: 'asc' },
				{ id: 'asc' },
			],
		});

		const allocationPlan = CashLotAllocationService.allocateFifo(
			availableLots.map((lot) => ({
				id: lot.id,
				remainingAmount: toNumber(lot.remainingAmount),
				exchangeRate: toNumber(lot.exchangeRate),
				withdrawalDate: lot.withdrawalDate,
			} satisfies CashLotSourceRow)),
			expenseAmount
		);

		if (allocationPlan.remainingAmount > 0) {
			throw new AppError(
				`Insufficient cash balance for ${expenseCurrency}. Missing ${allocationPlan.remainingAmount.toFixed(2)} ${expenseCurrency}.`,
				422
			);
		}

		let createdAllocationsCount = 0;

		for (const allocation of allocationPlan.allocations) {
			const lot = availableLots.find((row) => row.id === allocation.cashLotId);
			if (!lot) {
				throw new AppError('Cash lot allocation failed because the selected lot was not found', 409);
			}

			const updatedRemainingAmount = roundMoney(toNumber(lot.remainingAmount) - allocation.allocatedAmount);

			await db.cashLot.update({
				where: { id: lot.id },
				data: {
					remainingAmount: new Decimal(updatedRemainingAmount),
				},
			});

			await db.cashLotAllocation.create({
				data: {
					userId: transaction.userId,
					cashLotId: lot.id,
					expenseTransactionId: transaction.id,
					allocatedAmount: new Decimal(allocation.allocatedAmount),
					exchangeRate: new Decimal(allocation.exchangeRate),
				},
			});
			createdAllocationsCount += 1;
		}

		logger.info('Cash expense allocations created', {
			userId: transaction.userId,
			transactionId: transaction.id,
			totalAllocated: allocationPlan.totalAllocated,
			allocationCount: createdAllocationsCount,
		});

		return {
			allocations: allocationPlan.allocations,
			totalAllocated: allocationPlan.totalAllocated,
		};
	}

	async restoreExpenseAllocations(expenseTransactionId: number, userId: number, db: DbClient = this.db) {
		const allocations = await db.cashLotAllocation.findMany({
			where: {
				expenseTransactionId,
				userId,
			},
		});

		if (allocations.length === 0) {
			return 0;
		}

		const cashLotIds = [...new Set(allocations.map((allocation) => allocation.cashLotId))];
		const cashLots = await db.cashLot.findMany({
			where: {
				id: {
					in: cashLotIds,
				},
				userId,
			},
		});

		for (const cashLot of cashLots) {
			const allocatedAmount = allocations
				.filter((allocation) => allocation.cashLotId === cashLot.id)
				.reduce((sum, allocation) => sum + toNumber(allocation.allocatedAmount), 0);

			await db.cashLot.update({
				where: { id: cashLot.id },
				data: {
					remainingAmount: new Decimal(roundMoney(toNumber(cashLot.remainingAmount) + allocatedAmount)),
				},
			});
		}

		await db.cashLotAllocation.deleteMany({
			where: {
				expenseTransactionId,
				userId,
			},
		});

		return allocations.length;
	}

	async deleteWithdrawalCashLot(transactionId: number, userId: number, db: DbClient = this.db) {
		const cashLot = await db.cashLot.findFirst({
			where: {
				withdrawalTransactionId: transactionId,
				userId,
			},
			include: {
				allocations: true,
			},
		});

		if (!cashLot) {
			return null;
		}

		if (cashLot.allocations.length > 0 || roundMoney(toNumber(cashLot.remainingAmount)) < roundMoney(toNumber(cashLot.destinationAmount))) {
			throw new AppError('This withdrawal already has cash expenses linked to it and cannot be deleted', 409);
		}

		return db.cashLot.delete({
			where: {
				id: cashLot.id,
			},
		});
	}
}

export const CashLotServiceInstance = new CashLotService();
