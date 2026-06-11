import crypto from 'crypto';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import { BudgetRollover } from '../../modules/budgets/budget-rollover.service';
import { isBudgetOverflowTransferTransaction } from './budget-overflow-transfers';

export interface SharedMonthlySummaryPayload {
  token: string;
  title: string | null;
  month: number;
  year: number;
  monthLabel: string;
  createdAt: string;
  expiresAt: string | null;
  transactionCount: number;
  totals: {
    income: number;
    expenses: number;
    net: number;
    totalBudget: number;
    totalCarryOver: number;
    remainingBudget: number;
  };
  topCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  budgets: Array<{
    categoryId: number;
    category: string;
    limit: number;
    carryOver: number;
    effectiveBudget: number;
    spent: number;
    remaining: number;
    percentage: number;
    status: 'good' | 'warning' | 'over' | 'none';
  }>;
}

function getMonthDateRange(month: number, year: number) {
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { startDate, endDate };
}

function getMonthLabel(month: number, year: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function createShareToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function isValidShareMonth(month: number, year: number) {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2100;
}

export async function buildSharedMonthlySummary(userId: number, month: number, year: number, token: string, title: string | null, createdAt: Date, expiresAt: Date | null): Promise<SharedMonthlySummaryPayload> {
  const { startDate, endDate } = getMonthDateRange(month, year);
  const [transactions, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lt: endDate,
        },
        cashLot: {
          is: null,
        },
      },
      include: {
        category: true,
      },
      orderBy: { date: 'desc' },
    }),
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    }),
  ]);

  const visibleTransactions = transactions.filter((transaction) => !isBudgetOverflowTransferTransaction(transaction.referenceId));
  const income = roundAmount(
    visibleTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)
  );
  const expenses = roundAmount(
    visibleTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)
  );
  const net = roundAmount(income - expenses);

  const budgetCategories = categories.filter((category) => Number(category.amountLimit ?? 0) > 0);
  const budgetPeriods = await BudgetRollover.getOrCreateCurrentPeriods(
    budgetCategories.map((category) => category.id),
    startDate
  );

  const budgets = budgetCategories
    .map((category) => {
      const spent = roundAmount(
        transactions
          .filter((transaction) => transaction.categoryId === category.id)
          .reduce((sum, transaction) => {
            const amount = Number(transaction.amount ?? 0);
            const isTransfer = isBudgetOverflowTransferTransaction(transaction.referenceId);

            if (transaction.type === 'expense') {
              return sum + amount;
            }

            if (isTransfer) {
              return sum - amount;
            }

            return sum;
          }, 0)
      );
      const limit = roundAmount(Number(category.amountLimit ?? 0));
      const carryOver = roundAmount(Number(budgetPeriods.get(category.id)?.carryOver ?? 0));
      const effectiveBudget = roundAmount(limit + carryOver);
      const remaining = roundAmount(effectiveBudget - spent);
      const percentage = effectiveBudget > 0 ? roundAmount((spent / effectiveBudget) * 100) : 0;
      const status: 'good' | 'warning' | 'over' | 'none' =
        effectiveBudget === 0 ? 'none' : percentage > 100 ? 'over' : percentage > 80 ? 'warning' : 'good';

      return {
        categoryId: category.id,
        category: category.name,
        limit,
        carryOver,
        effectiveBudget,
        spent,
        remaining,
        percentage,
        status,
      };
    })
    .sort((left, right) => right.spent - left.spent);

  const spendingByCategory = new Map<string, number>();
  for (const transaction of visibleTransactions) {
    if (transaction.type !== 'expense') continue;
    const categoryName = transaction.category?.name ?? 'Other';
    spendingByCategory.set(categoryName, roundAmount((spendingByCategory.get(categoryName) ?? 0) + Number(transaction.amount ?? 0)));
  }

  const topCategories = [...spendingByCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: expenses > 0 ? roundAmount((amount / expenses) * 100) : 0,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);

  const totalBudget = roundAmount(budgets.reduce((sum, budget) => sum + budget.effectiveBudget, 0));
  const totalCarryOver = roundAmount(budgets.reduce((sum, budget) => sum + budget.carryOver, 0));
  const remainingBudget = roundAmount(budgets.reduce((sum, budget) => sum + budget.remaining, 0));

  return {
    token,
    title,
    month,
    year,
    monthLabel: getMonthLabel(month, year),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    transactionCount: transactions.length,
    totals: {
      income,
      expenses,
      net,
      totalBudget,
      totalCarryOver,
      remainingBudget,
    },
    topCategories,
    budgets,
  };
}
