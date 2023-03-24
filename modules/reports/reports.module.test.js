import { Reports } from './reports.module.js';

describe('ReportsModule', () => {
	describe('getMonthlyReport', () => {
		it('should return monthly report for a given month date', async () => {
			const monthDate = '01';
			const report = await Reports.getMonthlyReport(monthDate);
			console.log(report);

			expect(report).toBeDefined();
			expect(report.length).toBeGreaterThan(0);
			expect(report[0].category).toBeDefined();
			expect(report[0].total_debits).toBeDefined();
			expect(report[0].total_credits).toBeDefined();
			expect(report[0].category_balance).toBeDefined();
		});
	});
});
