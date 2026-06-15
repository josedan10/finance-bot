export type NormalizedTransactionType = 'income' | 'expense';

export function normalizeTransactionType(type: unknown): NormalizedTransactionType | null {
	if (typeof type !== 'string') {
		return null;
	}

	switch (type.trim().toLowerCase()) {
		case 'income':
		case 'credit':
			return 'income';
		case 'expense':
		case 'debit':
			return 'expense';
		default:
			return null;
	}
}

export function isIncomeTransactionType(type: unknown): boolean {
	return normalizeTransactionType(type) === 'income';
}

export function isExpenseTransactionType(type: unknown): boolean {
	return normalizeTransactionType(type) === 'expense';
}
