import { describe, expect, it } from '@jest/globals';

import {
	BELO_WITHDRAW_COMMISSION_RATE,
	getBeloWithdrawCommissionFromGross,
	getBeloWithdrawGrossFromReceiptAmount,
	isBeloWithdrawDescription,
} from './belo-withdraw.helper';

describe('belo-withdraw.helper', () => {
	it('should detect Belo withdraw descriptions', () => {
		expect(isBeloWithdrawDescription('Payment to Belo')).toBe(true);
		expect(isBeloWithdrawDescription(' payment to belo ')).toBe(true);
		expect(isBeloWithdrawDescription('Payment to Someone Else')).toBe(false);
	});

	it('should calculate gross and commission amounts from Belo withdrawals', () => {
		expect(BELO_WITHDRAW_COMMISSION_RATE).toBe(0.04);
		expect(getBeloWithdrawGrossFromReceiptAmount(96)).toBe(100);
		expect(getBeloWithdrawCommissionFromGross(100)).toBe(4);
	});
});
