// Notification Preference Service

import { PrismaClient, NotificationPreference } from '@prisma/client';
import { INotificationPreferenceService } from './types';
import { NotificationPreferenceInput, DEFAULT_THRESHOLDS } from '../../src/enums/notifications';

export class NotificationPreferenceService implements INotificationPreferenceService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  setPrisma(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getPreferences(userId: number): Promise<NotificationPreference | null> {
    return this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
  }

  async updatePreferences(
    userId: number,
    preferences: NotificationPreferenceInput
  ): Promise<NotificationPreference> {
    const data: any = {};

    if (preferences.emailEnabled !== undefined) {
      data.emailEnabled = preferences.emailEnabled;
    }

    if (preferences.webPushEnabled !== undefined) {
      data.webPushEnabled = preferences.webPushEnabled;
    }

    if (preferences.thresholds !== undefined) {
      data.thresholds = JSON.stringify(preferences.thresholds);
    }

    if (preferences.disabledCategories !== undefined) {
      data.disabledCategories = JSON.stringify(preferences.disabledCategories);
    }

    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
    });
  }

  async createDefault(userId: number): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.create({
      data: {
        userId,
        emailEnabled: true,
        webPushEnabled: false,
        thresholds: JSON.stringify(DEFAULT_THRESHOLDS.map(t => t.percentage)),
      },
    });
  }

  /**
   * Check if notifications are disabled for a specific category
   */
  async isCategoryEnabled(userId: number, categoryId: number): Promise<boolean> {
    const preferences = await this.getPreferences(userId);
    
    if (!preferences) {
      return true; // Default to enabled
    }

    if (!preferences.emailEnabled && !preferences.webPushEnabled) {
      return false;
    }

    // Check if this category is in the disabled list
    if (preferences.disabledCategories) {
      try {
        const disabled = JSON.parse(preferences.disabledCategories) as number[];
        return !disabled.includes(categoryId);
      } catch {
        return true;
      }
    }

    return true;
  }
}

export default new NotificationPreferenceService();
