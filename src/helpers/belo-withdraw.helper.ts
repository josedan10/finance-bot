export const BELO_WITHDRAW_COMMISSION_RATE = 0.04;

export function isBeloWithdrawDescription(description?: string | null): boolean {
	const normalizedDescription = description?.trim().toLowerCase() ?? '';

	return (
		normalizedDescription.includes('payment to belo') ||
		normalizedDescription.includes('withdraw to belo') ||
		normalizedDescription.includes('withdrawal to belo')
	);
}

export function getBeloWithdrawGrossFromReceiptAmount(amount: number): number {
	return Math.round((amount / (1 - BELO_WITHDRAW_COMMISSION_RATE)) * 100) / 100;
}

export function getBeloWithdrawCommissionFromGross(amount: number): number {
	return Math.round(amount * BELO_WITHDRAW_COMMISSION_RATE * 100) / 100;
}
