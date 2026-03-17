// Notification types for Budget Alerts

export interface BudgetThreshold {
  percentage: number;  // 50, 70, 90
  label: string;
  color: string;
}

export const DEFAULT_THRESHOLDS: BudgetThreshold[] = [
  { percentage: 50, label: 'Warning', color: '#22c55e' },   // Green - 50%
  { percentage: 70, label: 'Caution', color: '#f59e0b' },  // Yellow - 70%
  { percentage: 90, label: 'Critical', color: '#ef4444' }, // Red - 90%
];

export type NotificationChannel = 'email' | 'webpush';

export interface NotificationPayload {
  userId: number;
  userEmail: string;
  categoryId: number;
  categoryName: string;
  currentSpending: number;
  budgetLimit: number;
  percentage: number;
  threshold: number;
}

export interface NotificationPreferenceInput {
  emailEnabled?: boolean;
  webPushEnabled?: boolean;
  thresholds?: number[];
  disabledCategories?: number[];
}

export interface ThresholdCrossed {
  categoryId: number;
  categoryName: string;
  threshold: number;
  newPercentage: number;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  errorMessage?: string;
}
