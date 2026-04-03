import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GeminiAssistant } from './gemini.service';
import { ChatGPTAssistant } from './chatgpt.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from '../../src/config';

// Mock the AI SDKs
jest.mock('@google/generative-ai');
jest.mock('openai');
jest.mock('../../src/config', () => ({
  config: {
    GOOGLE_AI_API_KEY: 'test-google-key',
    GEMINI_MODEL: 'gemini-2.0-flash',
    OPENAI_API_KEY: 'test-openai-key',
  },
}));

const MockGoogleAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;
const initialGeminiModel = config.GEMINI_MODEL;

// For OpenAI, we'll use a very simple mock with explicit any to avoid TS issues
const mockCreate = jest.fn() as any;
(OpenAI as any).mockImplementation(() => ({
  chat: {
    completions: {
      create: mockCreate,
    },
  },
}));

describe('AI Providers', () => {
  describe('GeminiAssistant', () => {
    let assistant: GeminiAssistant;
    let mockModel: any;

    beforeEach(() => {
      jest.clearAllMocks();
      (config as { GEMINI_MODEL: string }).GEMINI_MODEL = initialGeminiModel;
      mockModel = {
        generateContent: jest.fn(),
      };
      MockGoogleAI.prototype.getGenerativeModel.mockReturnValue(mockModel);
      assistant = new GeminiAssistant();
    });

    it('should analyze expenses correctly', async () => {
      const mockResult = { categories: [{ name: 'Food', amount: 100 }], trends: ['Up'] };
      mockModel.generateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResult) },
      });

      const result = await assistant.analyzeExpenses([{ amount: 100 }]);
      expect(result).toEqual(mockResult);
    });

    it('should handle markdown wrapping in JSON', async () => {
      const mockResult = { categories: [{ name: 'Food', amount: 100 }], trends: ['Up'] };
      mockModel.generateContent.mockResolvedValue({
        response: { text: () => `\`\`\`json\n${JSON.stringify(mockResult)}\n\`\`\`` },
      });

      const result = await assistant.analyzeExpenses([{ amount: 100 }]);
      expect(result).toEqual(mockResult);
    });

    it('should handle errors in analyzeExpenses', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('API Error'));
      const result = await assistant.analyzeExpenses([]);
      expect(result).toEqual({ categories: [], trends: ['Error analyzing expenses'] });
    });

    it('should fallback to supported model when configured model is unavailable', async () => {
      const missingModelError = new Error(
        'Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent: [404 Not Found] models/gemini-1.5-flash is not found for API version v1beta'
      );
      const fallbackResult = { categories: [{ name: 'Food', amount: 100 }], trends: ['Up'] };

      MockGoogleAI.prototype.getGenerativeModel.mockImplementation(({ model }: { model: string }) => {
        if (model === 'gemini-1.5-flash') {
          return {
            generateContent: jest.fn(async () => {
              throw missingModelError;
            }),
          } as any;
        }

        return {
          generateContent: jest.fn(async () => ({
            response: { text: () => JSON.stringify(fallbackResult) },
          })),
        } as any;
      });

      (config as { GEMINI_MODEL: string }).GEMINI_MODEL = 'gemini-1.5-flash';

      const fallbackAssistant = new GeminiAssistant();
      const result = await fallbackAssistant.analyzeExpenses([{ amount: 100 }]);

      expect(result).toEqual(fallbackResult);
    });

    it('should detect anomalies correctly', async () => {
      const mockResult = [{ transactionId: 1, reason: 'High amount', severity: 'high' }];
      mockModel.generateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResult) },
      });

      const result = await assistant.detectAnomalies([{ id: 1, amount: 10000 }]);
      expect(result).toEqual(mockResult);
    });

    it('should suggest budget correctly', async () => {
      const mockResult = { categoryName: 'Food', suggestedLimit: 200, reason: 'Average spend' };
      mockModel.generateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResult) },
      });

      const result = await assistant.suggestBudget([{ category: 'Food', amount: 100 }]);
      expect(result).toEqual(mockResult);
    });
  });

  describe('ChatGPTAssistant', () => {
    let assistant: ChatGPTAssistant;

    beforeEach(() => {
      jest.clearAllMocks();
      assistant = new ChatGPTAssistant();
    });

    it('should analyze expenses correctly', async () => {
      const mockResult = { categories: [{ name: 'Food', amount: 100 }], trends: ['Up'] };
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockResult) } }],
      });

      const result = await assistant.analyzeExpenses([{ amount: 100 }]);
      expect(result).toEqual(mockResult);
    });

    it('should detect anomalies correctly', async () => {
      const mockResult = { anomalies: [{ transactionId: 1, reason: 'High amount', severity: 'high' }] };
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockResult) } }],
      });

      const result = await assistant.detectAnomalies([{ id: 1, amount: 10000 }]);
      expect(result).toEqual(mockResult.anomalies);
    });

    it('should suggest budget correctly', async () => {
      const mockResult = { categoryName: 'Food', suggestedLimit: 200, reason: 'Average spend' };
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockResult) } }],
      });

      const result = await assistant.suggestBudget([{ category: 'Food', amount: 100 }]);
      expect(result).toEqual(mockResult);
    });

    it('should handle errors in analyzeExpenses', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));
      const result = await assistant.analyzeExpenses([]);
      expect(result).toEqual({ categories: [], trends: ['Error analyzing expenses'] });
    });
  });
});
