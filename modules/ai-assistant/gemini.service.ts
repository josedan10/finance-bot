import { GoogleGenerativeAI } from '@google/generative-ai';
import { IAIAssistant, AnalysisResult, Anomaly, BudgetSuggestion } from './ai-assistant.interface';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

export class GeminiAssistant implements IAIAssistant {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async analyzeExpenses(transactions: any[]): Promise<AnalysisResult> {
    try {
      const prompt = `
        Analyze the following financial transactions and provide a summary in JSON format.
        Transactions: ${JSON.stringify(transactions)}
        
        The response should be a JSON object with this structure:
        {
          "categories": [{ "name": "string", "amount": number }],
          "trends": ["string"]
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Basic JSON extraction from markdown if necessary
      const jsonStr = text.replace(/```json|```/g, '').trim();
      return JSON.parse(jsonStr) as AnalysisResult;
    } catch (error) {
      logger.error('Gemini analyzeExpenses error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { categories: [], trends: ['Error analyzing expenses'] };
    }
  }

  async detectAnomalies(transactions: any[]): Promise<Anomaly[]> {
    try {
      const prompt = `
        Look for anomalies in these transactions and return a JSON array of anomalies.
        Transactions: ${JSON.stringify(transactions)}
        
        Each anomaly in the array should have this structure:
        {
          "transactionId": number,
          "reason": "string",
          "severity": "low" | "medium" | "high"
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonStr = text.replace(/```json|```/g, '').trim();
      return JSON.parse(jsonStr) as Anomaly[];
    } catch (error) {
      logger.error('Gemini detectAnomalies error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  async suggestBudget(historicalData: any[]): Promise<BudgetSuggestion> {
    try {
      const prompt = `
        Based on this historical financial data, suggest a budget limit for one category.
        Data: ${JSON.stringify(historicalData)}
        
        The response should be a single JSON object:
        {
          "categoryName": "string",
          "suggestedLimit": number,
          "reason": "string"
        }
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonStr = text.replace(/```json|```/g, '').trim();
      return JSON.parse(jsonStr) as BudgetSuggestion;
    } catch (error) {
      logger.error('Gemini suggestBudget error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { categoryName: 'Unknown', suggestedLimit: 0, reason: 'Error generating suggestion' };
    }
  }
}

export default new GeminiAssistant();
