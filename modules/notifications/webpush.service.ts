// Web Push Notification Service

import webpush from 'web-push';
import { INotificationService } from './types';
import { NotificationPayload, NotificationResult } from '../../src/enums/notifications';
import { PrismaModule } from '../database/database.module';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

// Configure VAPID keys for web push
if (config.VAPID_PUBLIC_KEY) {
  try {
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY
    );
  } catch (error) {
    logger.error('Failed to set VAPID details', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
} else {
  logger.warn('VAPID_PUBLIC_KEY is not set. Web push notifications will not work.');
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

export class WebPushNotificationService implements INotificationService {
  
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      // Fetch push subscriptions for this user
      const subscriptions = await PrismaModule.pushSubscription.findMany({
        where: { userId: payload.userId },
      });

      if (subscriptions.length === 0) {
        logger.debug('No push subscriptions found for user', { userId: payload.userId });
        return {
          success: true,
          channel: 'webpush',
        };
      }

      const notificationTitle = this.getNotificationTitle(payload.threshold);
      const notificationBody = this.getNotificationBody(payload);

      let successCount = 0;
      let failCount = 0;

      // Send to all subscriptions in parallel
      const sendPromises = subscriptions.map(async (subscription) => {
        const pushSubscription: PushSubscriptionData = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          expirationTime: subscription.expiresAt?.getTime(),
        };

        try {
          await webpush.sendNotification(
            pushSubscription as any,
            JSON.stringify({
              title: notificationTitle,
              body: notificationBody,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `budget-${payload.categoryId}-${payload.threshold}`,
              renotify: true,
              data: {
                url: '/dashboard',
                categoryId: payload.categoryId,
                threshold: payload.threshold,
                categoryName: payload.categoryName,
              },
            })
          );
          successCount++;
        } catch (error: any) {
          failCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // If subscription is no longer valid (410 Gone), remove it
          if (error.statusCode === 410) {
            logger.warn('Push subscription expired, removing', {
              subscriptionId: subscription.id,
              userId: payload.userId,
            });
            await this.removeSubscription(subscription.id);
          } else {
            logger.error('Failed to send push notification', {
              error: errorMessage,
              subscriptionId: subscription.id,
              userId: payload.userId,
            });
          }
        }
      });

      await Promise.all(sendPromises);

      logger.info('Web push notifications sent', {
        userId: payload.userId,
        categoryId: payload.categoryId,
        threshold: payload.threshold,
        successCount,
        failCount,
      });

      return {
        success: failCount === 0,
        channel: 'webpush',
      };
    } catch (error) {
      logger.error('Failed to send web push notifications', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: payload.userId,
      });

      return {
        success: false,
        channel: 'webpush',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async isAvailable(userId: number): Promise<boolean> {
    const count = await PrismaModule.pushSubscription.count({
      where: { userId },
    });
    return count > 0;
  }

  /**
   * Save a push subscription for a user
   * Called from frontend when user grants permission
   */
  async saveSubscription(
    userId: number,
    subscription: PushSubscriptionData
  ): Promise<{ id: number }> {
    // Check if this endpoint already exists for this user
    const existing = await PrismaModule.pushSubscription.findFirst({
      where: {
        userId,
        endpoint: subscription.endpoint,
      },
    });

    if (existing) {
      // Update existing subscription
      const updated = await PrismaModule.pushSubscription.update({
        where: { id: existing.id },
        data: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          expiresAt: subscription.expirationTime
            ? new Date(subscription.expirationTime)
            : null,
          updatedAt: new Date(),
        },
      });

      logger.info('Push subscription updated', { userId, subscriptionId: updated.id });
      return { id: updated.id };
    }

    // Create new subscription
    const created = await PrismaModule.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expiresAt: subscription.expirationTime
          ? new Date(subscription.expirationTime)
          : null,
      },
    });

    logger.info('Push subscription saved', { userId, subscriptionId: created.id });
    return { id: created.id };
  }

  /**
   * Remove a push subscription by ID
   */
  async removeSubscriptionById(subscriptionId: number): Promise<void> {
    await PrismaModule.pushSubscription.delete({
      where: { id: subscriptionId },
    });
    logger.info('Push subscription removed by ID', { subscriptionId });
  }

  /**
   * Remove a push subscription by endpoint
   */
  async removeSubscriptionByEndpoint(userId: number, endpoint: string): Promise<void> {
    await PrismaModule.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });
    logger.info('Push subscription removed by endpoint', { userId, endpoint });
  }

  /**
   * Internal removal by subscription ID
   */
  private async removeSubscription(id: number): Promise<void> {
    try {
      await PrismaModule.pushSubscription.delete({
        where: { id },
      });
    } catch (error) {
      // Ignore if already deleted
      logger.debug('Subscription already removed', { id });
    }
  }

  /**
   * Get notification title based on threshold
   */
  private getNotificationTitle(threshold: number): string {
    if (threshold >= 90) {
      return '🚨 Budget Alert: Critical!';
    } else if (threshold >= 70) {
      return '⚠️ Budget Warning';
    } else {
      return '📊 Budget Update';
    }
  }

  /**
   * Get notification body based on payload
   */
  private getNotificationBody(payload: NotificationPayload): string {
    const categoryName = payload.categoryName || 'Category';
    const percentage = payload.percentage?.toFixed(1) || payload.threshold.toString();
    const amount = payload.currentSpending?.toFixed(2) || '';
    const limit = payload.budgetLimit?.toFixed(2) || '';

    if (payload.threshold >= 90) {
      return `⚠️ You've spent ${percentage}% (${amount}) of your ${categoryName} budget (${limit})!`;
    } else if (payload.threshold >= 70) {
      return `You've spent ${percentage}% of your ${categoryName} budget. Consider reviewing your spending.`;
    } else {
      return `You've used ${percentage}% of your ${categoryName} budget.`;
    }
  }
}

export default new WebPushNotificationService();
