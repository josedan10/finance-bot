export type BudgetType = 'spending' | 'recurring' | 'goal' | 'reserve';

const BUDGET_TYPES = new Set<BudgetType>(['spending', 'recurring', 'goal', 'reserve']);

export function normalizeBudgetType(value: unknown): BudgetType {
	return typeof value === 'string' && BUDGET_TYPES.has(value as BudgetType) ? value as BudgetType : 'spending';
}

export function normalizeOptionalAmount(value: unknown): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeOptionalDueDay(value: unknown): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : null;
}

export function normalizeOptionalTargetDate(value: unknown): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	if (typeof value !== 'string') return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}
