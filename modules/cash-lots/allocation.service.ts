export interface CashLotSourceRow {
	id: number;
	remainingAmount: number;
	exchangeRate: number;
	withdrawalDate: Date;
}

export interface CashLotAllocationPlan {
	cashLotId: number;
	allocatedAmount: number;
	exchangeRate: number;
	sourceEquivalentAmount: number;
}

export interface CashLotAllocationResult {
	allocations: CashLotAllocationPlan[];
	remainingAmount: number;
	totalAllocated: number;
}

function roundMoney(value: number): number {
	return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundRate(value: number): number {
	return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;
}

export class AllocationService {
	allocateFifo(lots: CashLotSourceRow[], requiredAmount: number): CashLotAllocationResult {
		const normalizedRequiredAmount = roundMoney(requiredAmount);
		if (normalizedRequiredAmount <= 0) {
			return {
				allocations: [],
				remainingAmount: 0,
				totalAllocated: 0,
			};
		}

		const sortedLots = [...lots].sort((left, right) => {
			const timeDelta = left.withdrawalDate.getTime() - right.withdrawalDate.getTime();
			if (timeDelta !== 0) {
				return timeDelta;
			}

			return left.id - right.id;
		});

		const allocations: CashLotAllocationPlan[] = [];
		let remainingAmount = normalizedRequiredAmount;

		for (const lot of sortedLots) {
			if (remainingAmount <= 0) {
				break;
			}

			const availableAmount = roundMoney(lot.remainingAmount);
			if (availableAmount <= 0) {
				continue;
			}

			const allocatedAmount = roundMoney(Math.min(availableAmount, remainingAmount));
			if (allocatedAmount <= 0) {
				continue;
			}

			const exchangeRate = roundRate(lot.exchangeRate);
			const sourceEquivalentAmount = exchangeRate > 0 ? roundMoney(allocatedAmount / exchangeRate) : 0;

			allocations.push({
				cashLotId: lot.id,
				allocatedAmount,
				exchangeRate,
				sourceEquivalentAmount,
			});

			remainingAmount = roundMoney(remainingAmount - allocatedAmount);
		}

		return {
			allocations,
			remainingAmount,
			totalAllocated: roundMoney(normalizedRequiredAmount - remainingAmount),
		};
	}
}

export const CashLotAllocationService = new AllocationService();
