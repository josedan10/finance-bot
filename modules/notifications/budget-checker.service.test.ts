import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { BudgetCheckerService } from './budget-checker.service';
import { Decimal } from '@prisma/client/runtime/library';
import { BudgetRollover } from '../budgets/budget-rollover.service';

describe('BudgetCheckerService', () => {
  let budgetChecker: BudgetCheckerService;
  let prismaMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    budgetChecker = new BudgetCheckerService();
    budgetChecker.setPrisma(prismaMock);
    jest.spyOn(BudgetRollover, 'getOrCreateCurrentPeriod').mockResolvedValue({
      carryOver: new Decimal(0),
    } as never);
    jest.clearAllMocks();
  });

  const mockCategory = {
    id: 1,
    name: 'Food',
    userId: 1,
    amountLimit: new Decimal(1000),
  };

  it('should return no thresholds if category has no budget limit', async () => {
    prismaMock.category.findFirst.mockResolvedValue({
      ...mockCategory,
      amountLimit: null,
    } as any);

    const result = await budgetChecker.checkThreshold(1, 1, 100);
    expect(result).toHaveLength(0);
  });

  it('should detect 50% threshold crossing', async () => {
    prismaMock.category.findFirst.mockResolvedValue(mockCategory as any);
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: new Decimal(450) },
    } as any);
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    prismaMock.notificationLog.findFirst.mockResolvedValue(null);

    // 450 (previous) + 60 (new) = 510 (51% of 1000)
    const result = await budgetChecker.checkThreshold(1, 1, 60);
    
    expect(result).toHaveLength(1);
    expect(result[0].threshold).toBe(50);
    expect(result[0].newPercentage).toBe(51);
  });

  it('should detect 90% threshold crossing', async () => {
    prismaMock.category.findFirst.mockResolvedValue(mockCategory as any);
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: new Decimal(850) },
    } as any);
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    prismaMock.notificationLog.findFirst.mockResolvedValue(null);

    // 850 + 60 = 910 (91% of 1000)
    const result = await budgetChecker.checkThreshold(1, 1, 60);
    
    expect(result).toHaveLength(3); // 50, 70, and 90
    expect(result.map(r => r.threshold)).toContain(90);
  });

  it('should honor custom user thresholds', async () => {
    prismaMock.category.findFirst.mockResolvedValue(mockCategory as any);
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: new Decimal(750) },
    } as any);
    prismaMock.notificationPreference.findUnique.mockResolvedValue({
      userId: 1,
      thresholds: JSON.stringify([80]), // Only 80%
      emailEnabled: true,
      webPushEnabled: false,
    } as any);
    prismaMock.notificationLog.findFirst.mockResolvedValue(null);

    // 750 + 10 = 760 (76%) -> below 80%
    let result = await budgetChecker.checkThreshold(1, 1, 10);
    expect(result).toHaveLength(0);

    // 750 + 60 = 810 (81%) -> crosses 80%
    result = await budgetChecker.checkThreshold(1, 1, 60);
    expect(result).toHaveLength(1);
    expect(result[0].threshold).toBe(80);
  });

  it('should not return threshold if recently notified (deduplication)', async () => {
    prismaMock.category.findFirst.mockResolvedValue(mockCategory as any);
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: new Decimal(550) },
    } as any);
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    
    // Mock a recent notification for 50%
    (prismaMock.notificationLog.findFirst as any).mockImplementation(({ where }: any) => {
      if (where.threshold === 50) return Promise.resolve({ id: 1 } as any);
      return Promise.resolve(null);
    });

    // 550 + 10 = 560 (56%) -> crosses 50%, but already notified
    const result = await budgetChecker.checkThreshold(1, 1, 10);
    
    expect(result).toHaveLength(0);
  });
});
