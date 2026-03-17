import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { NotificationFactory } from './notification.factory';
import { EmailNotificationService } from './email.service';
import { WebPushNotificationService } from './webpush.service';
import { BudgetCheckerService } from './budget-checker.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { Decimal } from '@prisma/client/runtime/library';

// Mock web-push BEFORE anything else to prevent setVapidDetails from running
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

// Mock the config BEFORE importing anything that uses it
jest.mock('../../src/config', () => ({
  config: {
    TEST_CHAT_ID: 123,
    VAPID_PUBLIC_KEY: 'BIZwiUIyWaFVLiI9SDpul6Z-6bLWgVV58ZzFcCkUxTCDFZz23OjsA53_nf3V-PPOQvveZgckrObUUNmEnxoj5Nk',
    VAPID_PRIVATE_KEY: 'Ge9lgSNdANlZhDbkpEz-6X77z8nlcOyhgpIiqCLlJG8',
    VAPID_SUBJECT: 'mailto:test@test.com',
  }
}));

// Mock the services
jest.mock('./email.service');
jest.mock('./webpush.service');
jest.mock('./budget-checker.service');
jest.mock('./notification-preference.service');

describe('NotificationFactory', () => {
  let factory: NotificationFactory;
  let prismaMock: DeepMockProxy<PrismaClient>;
  let emailServiceMock: jest.Mocked<EmailNotificationService>;
  let webPushServiceMock: jest.Mocked<WebPushNotificationService>;
  let budgetCheckerMock: jest.Mocked<BudgetCheckerService>;
  let preferenceServiceMock: jest.Mocked<NotificationPreferenceService>;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    factory = new NotificationFactory();
    
    // Access private members for mocking
    (factory as any).prisma = prismaMock;
    emailServiceMock = (factory as any).emailService;
    webPushServiceMock = (factory as any).webPushService;
    budgetCheckerMock = (factory as any).budgetChecker;
    preferenceServiceMock = (factory as any).preferenceService;

    jest.clearAllMocks();
  });

  it('should not notify if all channels are disabled', async () => {
    preferenceServiceMock.getPreferences.mockResolvedValue({
      emailEnabled: false,
      webPushEnabled: false,
      thresholds: '[]',
      disabledCategories: '[]',
    } as any);

    await factory.notifyBudgetThreshold(1, 1, 100);

    expect(budgetCheckerMock.checkThreshold).not.toHaveBeenCalled();
  });

  it('should not notify if category is disabled', async () => {
    preferenceServiceMock.getPreferences.mockResolvedValue({
      emailEnabled: true,
      webPushEnabled: true,
    } as any);
    preferenceServiceMock.isCategoryEnabled.mockResolvedValue(false);

    await factory.notifyBudgetThreshold(1, 1, 100);

    expect(budgetCheckerMock.checkThreshold).not.toHaveBeenCalled();
  });

  it('should send notifications when thresholds are crossed', async () => {
    preferenceServiceMock.getPreferences.mockResolvedValue({
      emailEnabled: true,
      webPushEnabled: true,
    } as any);
    preferenceServiceMock.isCategoryEnabled.mockResolvedValue(true);
    prismaMock.user.findUnique.mockResolvedValue({ email: 'test@example.com' } as any);
    prismaMock.category.findFirst.mockResolvedValue({ 
      id: 1, 
      name: 'Food', 
      amountLimit: new Decimal(1000) 
    } as any);
    prismaMock.transaction.aggregate.mockResolvedValue({ 
      _sum: { amount: new Decimal(500) } 
    } as any);

    budgetCheckerMock.checkThreshold.mockResolvedValue([
      { categoryId: 1, categoryName: 'Food', threshold: 50, newPercentage: 50 }
    ]);

    emailServiceMock.send.mockResolvedValue({ success: true, channel: 'email' });
    webPushServiceMock.send.mockResolvedValue({ success: true, channel: 'webpush' });

    await factory.notifyBudgetThreshold(1, 1, 100);

    expect(emailServiceMock.send).toHaveBeenCalled();
    expect(webPushServiceMock.send).toHaveBeenCalled();
    expect(prismaMock.notificationLog.create).toHaveBeenCalledTimes(2);
  });
});
