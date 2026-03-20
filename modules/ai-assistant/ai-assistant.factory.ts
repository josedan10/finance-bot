import { IAIAssistant } from './ai-assistant.interface';
import GeminiAssistant from './gemini.service';
import ChatGPTAssistant from './chatgpt.service';
import { PrismaModule as prisma } from '../database/database.module';
import logger from '../../src/lib/logger';

export class AIAssistantFactory {
  static async getProvider(userId: number): Promise<IAIAssistant | null> {
    try {
      const settings = await prisma.aISettings.findUnique({
        where: { userId },
      });

      if (!settings || !settings.aiEnabled) {
        return null;
      }

      switch (settings.aiProvider) {
        case 'GEMINI':
          return GeminiAssistant;
        case 'CHATGPT':
          return ChatGPTAssistant;
        default:
          return GeminiAssistant;
      }
    } catch (error) {
      logger.error('Error in AIAssistantFactory', { error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }
}

export default AIAssistantFactory;
