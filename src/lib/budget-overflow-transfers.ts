import { createHash } from 'crypto';

export const BUDGET_OVERFLOW_TRANSFER_REFERENCE_PREFIX = 'bo:';

export type BudgetOverflowTransferLeg = 'source' | 'allocation';

export function buildBudgetOverflowTransferReference(params: {
	movementId: number;
	sourceCategoryId: number;
	targetCategoryId?: number | null;
	month: number;
	year: number;
	leg: BudgetOverflowTransferLeg;
}): string {
	const digest = createHash('sha1')
		.update(
			[
				params.movementId,
				params.sourceCategoryId,
				params.targetCategoryId ?? 'source',
				params.month,
				params.year,
				params.leg,
			].join(':')
		)
		.digest('base64url')
		.slice(0, 12);

	return `${BUDGET_OVERFLOW_TRANSFER_REFERENCE_PREFIX}${digest}`;
}

export function isBudgetOverflowTransferReference(referenceId?: string | null): boolean {
	return typeof referenceId === 'string' && referenceId.startsWith(BUDGET_OVERFLOW_TRANSFER_REFERENCE_PREFIX);
}

export function isBudgetOverflowTransferTransaction(referenceId?: string | null): boolean {
	return isBudgetOverflowTransferReference(referenceId);
}
