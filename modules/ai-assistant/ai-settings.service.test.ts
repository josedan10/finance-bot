import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient, AIProvider } from '@prisma/client';
import AISettingsService from './ai-settings.service';
import { PrismaModule as prisma } from '../database/database.module';

jest.mock('../database/database.module', () => ({
  PrismaModule: mockDeep<PrismaClient>(),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

describe('AISettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const mockSettings = { userId: 1, aiEnabled: true, aiProvider: AIProvider.GEMINI };
      prismaMock.aISettings.findUnique.mockResolvedValue(mockSettings as any);

      const result = await AISettingsService.getSettings(1);

      expect(result).toEqual(mockSettings);
      expect(prismaMock.aISettings.findUnique).toHaveBeenCalledWith({ where: { userId: 1 } });
    });

    it('should create and return default settings if none exist', async () => {
      prismaMock.aISettings.findUnique.mockResolvedValue(null as any);
      
      const mockCreatedSettings = { userId: 1, aiEnabled: false, aiProvider: AIProvider.GEMINI };
      prismaMock.aISettings.create.mockResolvedValue(mockCreatedSettings as any);

      const result = await AISettingsService.getSettings(1);

      expect(result).toEqual(mockCreatedSettings);
      expect(prismaMock.aISettings.create).toHaveBeenCalledWith({
        data: { userId: 1, aiEnabled: false, aiProvider: AIProvider.GEMINI },
      });
    });
  });

  describe('updateSettings', () => {
    it('should upsert settings correctly', async () => {
      const mockUpdated = { userId: 1, aiEnabled: true, aiProvider: AIProvider.CHATGPT };
      prismaMock.aISettings.upsert.mockResolvedValue(mockUpdated as any);

      const data = { aiEnabled: true, aiProvider: AIProvider.CHATGPT };
      const result = await AISettingsService.updateSettings(1, data);

      expect(result).toEqual(mockUpdated);
      expect(prismaMock.aISettings.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: expect.objectContaining({ ...data }),
        create: {
          userId: 1,
          aiEnabled: true,
          aiProvider: AIProvider.CHATGPT,
        },
      });
    });
  });
});
