export type DashboardBudgetSort = 'manual' | 'name' | 'most-spent';

export interface DashboardBudgetPreferences {
	sortBy: DashboardBudgetSort;
	hiddenBudgetIds: number[];
	manualBudgetOrderIds: number[];
}

export const DEFAULT_DASHBOARD_BUDGET_PREFERENCES: DashboardBudgetPreferences = {
	sortBy: 'manual',
	hiddenBudgetIds: [],
	manualBudgetOrderIds: [],
};

const validSorts = new Set<DashboardBudgetSort>(['manual', 'name', 'most-spent']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function sanitizeBudgetIds(value: unknown): number[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const uniqueIds = new Set<number>();

	for (const entry of value) {
		if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) {
			uniqueIds.add(entry);
		}
	}

	return [...uniqueIds];
}

export function normalizeDashboardBudgetPreferences(value: unknown): DashboardBudgetPreferences {
	if (!isRecord(value)) {
		return { ...DEFAULT_DASHBOARD_BUDGET_PREFERENCES };
	}

	const sortBy = validSorts.has(value.sortBy as DashboardBudgetSort)
		? (value.sortBy as DashboardBudgetSort)
		: DEFAULT_DASHBOARD_BUDGET_PREFERENCES.sortBy;

	return {
		sortBy,
		hiddenBudgetIds: sanitizeBudgetIds(value.hiddenBudgetIds),
		manualBudgetOrderIds: sanitizeBudgetIds(value.manualBudgetOrderIds),
	};
}

export function resolveDashboardBudgetPreferences(
	currentValue: unknown,
	patchValue: unknown
): DashboardBudgetPreferences {
	const current = normalizeDashboardBudgetPreferences(currentValue);

	if (!isRecord(patchValue)) {
		return current;
	}

	return {
		sortBy: validSorts.has(patchValue.sortBy as DashboardBudgetSort)
			? (patchValue.sortBy as DashboardBudgetSort)
			: current.sortBy,
		hiddenBudgetIds: Array.isArray(patchValue.hiddenBudgetIds)
			? sanitizeBudgetIds(patchValue.hiddenBudgetIds)
			: current.hiddenBudgetIds,
		manualBudgetOrderIds: Array.isArray(patchValue.manualBudgetOrderIds)
			? sanitizeBudgetIds(patchValue.manualBudgetOrderIds)
			: current.manualBudgetOrderIds,
	};
}
