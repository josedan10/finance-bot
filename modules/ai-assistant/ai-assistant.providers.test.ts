import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GeminiAssistant } from './gemini.service';
import { ChatGPTAssistant } from './chatgpt.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

// Mock the AI SDKs
jest.mock('@google/generative-ai');
jest.mock('openai');

const MockGoogleAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;

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
