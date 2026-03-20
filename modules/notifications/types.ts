// Notification Types and Interfaces

import { NotificationChannel, NotificationPayload, NotificationResult } from '../../src/enums/notifications';

/**
 * Base interface for all notification channels
 */
export interface INotificationService {
  /**
   * Send a notification to the user
   * @param payload Notification data
   * @returns Result of the notification attempt
   */
  send(payload: NotificationPayload): Promise<NotificationResult>;
  
  /**
   * Check if this channel is available for the user
   */
  isAvailable(userId: number): Promise<boolean>;
}

/**
 * Factory for creating notification service instances
 */
export interface INotificationFactory {
  /**
   * Create a notification service for the specified channel
   * @param channel The notification channel (email, webpush, etc.)
   * @returns Notification service instance
   */
  create(channel: NotificationChannel): INotificationService;
}

/**
 * Budget checker interface
 */
export interface IBudgetChecker {
  /**
   * Check if any budget thresholds have been crossed after a transaction
   * @param userId User ID
   * @param categoryId Category that was just modified
   * @param newTransactionAmount Amount of the new transaction
   * @returns Array of thresholds that were crossed
   */
  checkThreshold(
    userId: number,
    categoryId: number,
    newTransactionAmount: number
  ): Promise<import('../../src/enums/notifications').ThresholdCrossed[]>;
}

/**
 * Notification preference service interface
 */
export interface INotificationPreferenceService {
  /**
   * Get user notification preferences
   */
  getPreferences(userId: number): Promise<import('@prisma/client').NotificationPreference | null>;
  
  /**
   * Update user notification preferences
   */
  updatePreferences(
    userId: number,
    preferences: import('../../src/enums/notifications').NotificationPreferenceInput
  ): Promise<import('@prisma/client').NotificationPreference>;
  
  /**
   * Create default preferences for a user
   */
  createDefault(userId: number): Promise<import('@prisma/client').NotificationPreference>;

  /**
   * Check if notifications are enabled for a specific category
   */
  isCategoryEnabled(userId: number, categoryId: number): Promise<boolean>;
}
