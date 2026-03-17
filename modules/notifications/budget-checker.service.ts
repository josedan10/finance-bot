// Budget Checker Service

import { PrismaClient } from '@prisma/client';
import { IBudgetChecker } from './types';
import { ThresholdCrossed, DEFAULT_THRESHOLDS } from '../../src/enums/notifications';

export class BudgetCheckerService implements IBudgetChecker {
  private prisma: PrismaClient;

  constructor() {
    // We'll inject the Prisma client later
    this.prisma = new PrismaClient();
  }

  setPrisma(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async checkThreshold(
    userId: number,
    categoryId: number,
    newTransactionAmount: number
  ): Promise<ThresholdCrossed[]> {
    // 1. Get the category with its budget limit
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId: userId,
      },
    });

    if (!category || !category.amountLimit) {
      // No budget limit set for this category
      return [];
    }

    // 2. Get the start of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 3. Calculate total spending this month (excluding the new transaction if it was already saved)
    // We need to get the total including the new transaction
    const spending = await this.prisma.transaction.aggregate({
      where: {
        userId: userId,
        categoryId: categoryId,
        type: 'expense',
        date: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const totalSpent = (spending._sum.amount?.toNumber() || 0) + newTransactionAmount;
    
    // 4. Calculate percentage
    const budgetLimit = category.amountLimit.toNumber();
    const percentage = (totalSpent / budgetLimit) * 100;

    // 5. Get user's custom thresholds or use defaults
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    const thresholds = preferences?.emailEnabled !== false || preferences?.webPushEnabled !== false
      ? this.parseThresholds(preferences?.thresholds)
      : DEFAULT_THRESHOLDS.map(t => t.percentage);

    // 6. Check which thresholds were crossed
    const crossedThresholds: ThresholdCrossed[] = [];
    
    for (const threshold of thresholds) {
      if (percentage >= threshold) {
        // Check if we already sent a notification for this threshold recently
        const recentNotification = await this.prisma.notificationLog.findFirst({
          where: {
            userId,
            categoryId,
            threshold,
            channel: preferences?.emailEnabled ? 'email' : 'webpush',
            createdAt: {
              // Only consider notifications sent in the last 24 hours
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        });

        if (!recentNotification) {
          crossedThresholds.push({
            categoryId,
            categoryName: category.name,
            threshold,
            newPercentage: Math.round(percentage * 100) / 100,
          });
        }
      }
    }

    return crossedThresholds;
  }

  /**
   * Parse thresholds from JSON string to number array
   */
  private parseThresholds(thresholdsJson: string | null | undefined): number[] {
    if (!thresholdsJson) {
      return DEFAULT_THRESHOLDS.map(t => t.percentage);
    }

    try {
      const parsed = JSON.parse(thresholdsJson);
      return Array.isArray(parsed) ? parsed : DEFAULT_THRESHOLDS.map(t => t.percentage);
    } catch {
      return DEFAULT_THRESHOLDS.map(t => t.percentage);
    }
  }
}

export default new BudgetCheckerService();
