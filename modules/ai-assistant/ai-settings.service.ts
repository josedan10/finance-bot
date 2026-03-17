import { PrismaModule as prisma } from '../database/database.module';
import { AIProvider } from '@prisma/client';
import logger from '../../src/lib/logger';

export class AISettingsService {
  async getSettings(userId: number) {
    try {
      let settings = await prisma.aISettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        // Initialize default settings if they don't exist
        settings = await prisma.aISettings.create({
          data: {
            userId,
            aiEnabled: false,
            aiProvider: AIProvider.GEMINI,
          },
        });
      }

      return settings;
    } catch (error) {
      logger.error('Error in AISettingsService.getSettings', { userId, error });
      throw error;
    }
  }

  async updateSettings(userId: number, data: { aiEnabled?: boolean; aiProvider?: AIProvider }) {
    try {
      const updated = await prisma.aISettings.upsert({
        where: { userId },
        update: {
          ...data,
          updatedAt: new Date(),
        },
        create: {
          userId,
          aiEnabled: data.aiEnabled || false,
          aiProvider: data.aiProvider || AIProvider.GEMINI,
        },
      });

      logger.info('AI Settings updated', { userId, data });
      return updated;
    } catch (error) {
      logger.error('Error in AISettingsService.updateSettings', { userId, data, error });
      throw error;
    }
  }
}

export default new AISettingsService();
