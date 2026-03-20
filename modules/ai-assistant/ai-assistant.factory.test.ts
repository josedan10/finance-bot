import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient, AIProvider } from '@prisma/client';
import AIAssistantFactory from './ai-assistant.factory';
import GeminiAssistant from './gemini.service';
import ChatGPTAssistant from './chatgpt.service';
import { PrismaModule as prisma } from '../database/database.module';

jest.mock('../database/database.module', () => ({
  PrismaModule: mockDeep<PrismaClient>(),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

describe('AIAssistantFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null if settings not found', async () => {
    prismaMock.aISettings.findUnique.mockResolvedValue(null as any);
    const provider = await AIAssistantFactory.getProvider(1);
    expect(provider).toBeNull();
  });

  it('should return null if aiEnabled is false', async () => {
    prismaMock.aISettings.findUnique.mockResolvedValue({ aiEnabled: false } as any);
    const provider = await AIAssistantFactory.getProvider(1);
    expect(provider).toBeNull();
  });

  it('should return GeminiAssistant for GEMINI provider', async () => {
    prismaMock.aISettings.findUnique.mockResolvedValue({ aiEnabled: true, aiProvider: AIProvider.GEMINI } as any);
    const provider = await AIAssistantFactory.getProvider(1);
    expect(provider).toBe(GeminiAssistant);
  });

  it('should return ChatGPTAssistant for CHATGPT provider', async () => {
    prismaMock.aISettings.findUnique.mockResolvedValue({ aiEnabled: true, aiProvider: AIProvider.CHATGPT } as any);
    const provider = await AIAssistantFactory.getProvider(1);
    expect(provider).toBe(ChatGPTAssistant);
  });

  it('should default to GeminiAssistant for unknown provider', async () => {
    prismaMock.aISettings.findUnique.mockResolvedValue({ aiEnabled: true, aiProvider: 'UNKNOWN' as any } as any);
    const provider = await AIAssistantFactory.getProvider(1);
    expect(provider).toBe(GeminiAssistant);
  });

  it('should return null on error', async () => {
    prismaMock.aISettings.findUnique.mockRejectedValue(new Error('DB Error'));
    const provider = await AIAssistantFactory.getProvider(1);
    expect(provider).toBeNull();
  });
});
