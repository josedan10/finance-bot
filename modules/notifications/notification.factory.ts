// Notification Factory

import { NotificationChannel, NotificationPayload, NotificationResult, ThresholdCrossed } from '../../src/enums/notifications';
import { INotificationService, INotificationFactory, IBudgetChecker, INotificationPreferenceService } from './types';
import { EmailNotificationService } from './email.service';
import { WebPushNotificationService } from './webpush.service';
import { BudgetCheckerService } from './budget-checker.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { PrismaClient } from '@prisma/client';
import logger from '../../src/lib/logger';

export class NotificationFactory implements INotificationFactory {
  private emailService: INotificationService;
  private webPushService: INotificationService;
  private budgetChecker: IBudgetChecker;
  private preferenceService: INotificationPreferenceService;
  private prisma: PrismaClient;

  constructor() {
    this.emailService = new EmailNotificationService();
    this.webPushService = new WebPushNotificationService();
    this.budgetChecker = new BudgetCheckerService();
    this.preferenceService = new NotificationPreferenceService();
    this.prisma = new PrismaClient();

    // Inject Prisma client into services that need it
    (this.budgetChecker as BudgetCheckerService).setPrisma(this.prisma);
    (this.preferenceService as NotificationPreferenceService).setPrisma(this.prisma);
  }

  create(channel: NotificationChannel): INotificationService {
    switch (channel) {
      case 'email':
        return this.emailService;
      case 'webpush':
        return this.webPushService;
      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }
  }

  /**
   * Main entry point: Check budgets and send notifications
   * Called after a transaction is created/updated
   */
  async notifyBudgetThreshold(
    userId: number,
    categoryId: number,
    transactionAmount: number
  ): Promise<void> {
    try {
      // 1. Get user preferences
      let preferences = await this.preferenceService.getPreferences(userId);
      
      // Create default preferences if none exist
      if (!preferences) {
        preferences = await this.preferenceService.createDefault(userId);
      }

      // 2. Check if notifications are disabled globally
      if (!preferences.emailEnabled && !preferences.webPushEnabled) {
        logger.debug('Notifications disabled for user', { userId });
        return;
      }

      // 3. Check if this category is disabled
      const categoryEnabled = await this.preferenceService.isCategoryEnabled(userId, categoryId);
      if (!categoryEnabled) {
        logger.debug('Notifications disabled for category', { userId, categoryId });
        return;
      }

      // 4. Get user email from database
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user) {
        logger.error('User not found for notification', { userId });
        return;
      }

      // 5. Check which thresholds were crossed
      const crossedThresholds = await this.budgetChecker.checkThreshold(
        userId,
        categoryId,
        transactionAmount
      );

      if (crossedThresholds.length === 0) {
        logger.debug('No thresholds crossed', { userId, categoryId });
        return;
      }

      // 6. Get category and budget info
      const category = await this.prisma.category.findFirst({
        where: { id: categoryId, userId },
      });

      if (!category || !category.amountLimit) {
        return;
      }

      // Calculate current spending
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const spending = await this.prisma.transaction.aggregate({
        where: {
          userId,
          categoryId,
          type: 'expense',
          date: { gte: startOfMonth },
        },
        _sum: { amount: true },
      });

      const totalSpent = (spending._sum.amount?.toNumber() || 0);
      const percentage = (totalSpent / category.amountLimit.toNumber()) * 100;

      // 7. Send notifications for each crossed threshold
      for (const threshold of crossedThresholds) {
        const payload: NotificationPayload = {
          userId,
          userEmail: user.email,
          categoryId,
          categoryName: category.name,
          currentSpending: totalSpent,
          budgetLimit: category.amountLimit.toNumber(),
          percentage: Math.round(percentage * 100) / 100,
          threshold: threshold.threshold,
        };

        // Send email if enabled
        if (preferences.emailEnabled) {
          const result = await this.emailService.send(payload);
          await this.logNotification(userId, categoryId, 'email', threshold.threshold, percentage, result);
        }

        // Send web push if enabled
        if (preferences.webPushEnabled) {
          const result = await this.webPushService.send(payload);
          await this.logNotification(userId, categoryId, 'webpush', threshold.threshold, percentage, result);
        }
      }
    } catch (error) {
      logger.error('Error in notifyBudgetThreshold', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        categoryId,
      });
    }
  }

  /**
   * Log notification to database for deduplication
   */
  private async logNotification(
    userId: number,
    categoryId: number,
    channel: string,
    threshold: number,
    percentage: number,
    result: NotificationResult
  ): Promise<void> {
    try {
      await this.prisma.notificationLog.create({
        data: {
          userId,
          categoryId,
          channel,
          threshold,
          percentage,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.errorMessage,
        },
      });
    } catch (error) {
      logger.error('Failed to log notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get preference service for API endpoints
   */
  getPreferenceService(): INotificationPreferenceService {
    return this.preferenceService;
  }

  /**
   * Get web push service for API endpoints
   */
  getWebPushService(): WebPushNotificationService {
    return this.webPushService as WebPushNotificationService;
  }
}

export default new NotificationFactory();
