import OpenAI from 'openai';
import { IAIAssistant, AnalysisResult, Anomaly, BudgetSuggestion, AITransactionInput } from './ai-assistant.interface';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

export class ChatGPTAssistant implements IAIAssistant {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }

  async analyzeExpenses(transactions: AITransactionInput[]): Promise<AnalysisResult> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a financial analyst. Provide your analysis in JSON format.' },
          { role: 'user', content: `Analyze these transactions: ${JSON.stringify(transactions)}. Response should be a JSON object with "categories" (name and amount) and "trends" (array of strings).` }
        ],
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      return JSON.parse(response || '{}') as AnalysisResult;
    } catch (error) {
      logger.error('ChatGPT analyzeExpenses error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { categories: [], trends: ['Error analyzing expenses'] };
    }
  }

  async detectAnomalies(transactions: AITransactionInput[]): Promise<Anomaly[]> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a financial analyst. Detect anomalies in JSON format.' },
          { role: 'user', content: `Analyze these transactions for anomalies: ${JSON.stringify(transactions)}. Response should be a JSON object with an "anomalies" array, each having transactionId, reason, and severity (low/medium/high).` }
        ],
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' }
      });

      const response = JSON.parse(completion.choices[0].message.content || '{"anomalies":[]}');
      return response.anomalies as Anomaly[];
    } catch (error) {
      logger.error('ChatGPT detectAnomalies error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  async suggestBudget(historicalData: AITransactionInput[]): Promise<BudgetSuggestion> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a financial planner. Suggest a budget in JSON format.' },
          { role: 'user', content: `Based on this data, suggest a budget for one category: ${JSON.stringify(historicalData)}. Response should be a JSON object with categoryName, suggestedLimit, and reason.` }
        ],
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      return JSON.parse(response || '{}') as BudgetSuggestion;
    } catch (error) {
      logger.error('ChatGPT suggestBudget error', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { categoryName: 'Unknown', suggestedLimit: 0, reason: 'Error generating suggestion' };
    }
  }
}

export default new ChatGPTAssistant();
