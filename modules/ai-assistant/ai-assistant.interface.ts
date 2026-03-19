export type AnalysisResult = {
  categories: { name: string; amount: number }[];
  trends: string[];
};

export type Anomaly = {
  transactionId: number;
  reason: string;
  severity: 'low' | 'medium' | 'high';
};

export type BudgetSuggestion = {
  categoryName: string;
  suggestedLimit: number;
  reason: string;
};

export type AITransactionInput = {
  id?: number;
  date?: string;
  amount: number;
  currency?: string;
  category?: string;
  description?: string | null;
  type?: string;
};

export interface IAIAssistant {
  analyzeExpenses(transactions: AITransactionInput[]): Promise<AnalysisResult>;
  detectAnomalies(transactions: AITransactionInput[]): Promise<Anomaly[]>;
  suggestBudget(historicalData: AITransactionInput[]): Promise<BudgetSuggestion>;
}
