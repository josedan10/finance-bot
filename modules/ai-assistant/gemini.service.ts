import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IAIAssistant, AnalysisResult, Anomaly, BudgetSuggestion, AITransactionInput } from './ai-assistant.interface';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

export class GeminiAssistant implements IAIAssistant {
	private genAI: GoogleGenerativeAI;
	private model: GenerativeModel;
	private readonly modelCandidates: string[];

	constructor() {
		this.genAI = new GoogleGenerativeAI(config.GOOGLE_AI_API_KEY);
		this.modelCandidates = [...new Set([config.GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-2.0-flash-lite'])];
		this.model = this.genAI.getGenerativeModel({ model: this.modelCandidates[0] });
	}

	private isGeminiModelNotFoundError(error: unknown): boolean {
		if (typeof error !== 'object' || error === null || !('message' in error)) {
			return false;
		}

		const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
		return (
			message.includes('not found') &&
			(message.includes('models/') || message.includes('model')) &&
			(message.includes('generatecontent') || message.includes('api version'))
		);
	}

	private async runPrompt(prompt: string): Promise<string> {
		let lastError: unknown = null;

		for (const modelName of this.modelCandidates) {
			try {
				const model = this.genAI.getGenerativeModel({ model: modelName });
				const result = await model.generateContent(prompt);
				const response = await result.response;
				this.model = model;
				return response.text();
			} catch (error) {
				lastError = error;
				if (this.isGeminiModelNotFoundError(error)) {
					logger.warn('Gemini model unavailable for AI assistant, trying fallback model', { modelName });
					continue;
				}
				throw error;
			}
		}

		throw lastError instanceof Error ? lastError : new Error('Gemini model is unavailable');
	}

	private parseJsonResponse<T>(responseText: string): T {
		const jsonStr = responseText.replace(/```json|```/g, '').trim();
		return JSON.parse(jsonStr) as T;
	}

	async analyzeExpenses(transactions: AITransactionInput[]): Promise<AnalysisResult> {
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

			const text = await this.runPrompt(prompt);
			return this.parseJsonResponse<AnalysisResult>(text);
		} catch (error) {
			logger.error('Gemini analyzeExpenses error', { error: error instanceof Error ? error.message : 'Unknown error' });
			return { categories: [], trends: ['Error analyzing expenses'] };
		}
	}

	async detectAnomalies(transactions: AITransactionInput[]): Promise<Anomaly[]> {
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

			const text = await this.runPrompt(prompt);
			return this.parseJsonResponse<Anomaly[]>(text);
		} catch (error) {
			logger.error('Gemini detectAnomalies error', { error: error instanceof Error ? error.message : 'Unknown error' });
			return [];
		}
	}

	async suggestBudget(historicalData: AITransactionInput[]): Promise<BudgetSuggestion> {
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

			const text = await this.runPrompt(prompt);
			return this.parseJsonResponse<BudgetSuggestion>(text);
		} catch (error) {
			logger.error('Gemini suggestBudget error', { error: error instanceof Error ? error.message : 'Unknown error' });
			return { categoryName: 'Unknown', suggestedLimit: 0, reason: 'Error generating suggestion' };
		}
	}
}

export default new GeminiAssistant();
