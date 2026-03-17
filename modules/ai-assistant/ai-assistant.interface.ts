export interface IAIAssistant {
  analyzeExpenses(transactions: any[]): Promise<AnalysisResult>;
  detectAnomalies(transactions: any[]): Promise<Anomaly[]>;
  suggestBudget(historicalData: any[]): Promise<BudgetSuggestion>;
}

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
