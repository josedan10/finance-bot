import { Reports } from './reports.module.js';

describe('ReportsModule: ', () => {
	test('should return monthly report for a given month date', async () => {
		const monthDate = '01';
		const report = await Reports.getMonthlyReport(monthDate);

		expect(report).toBeDefined();
		expect(report.length).toBeGreaterThan(0);
		expect(report[0].category).toBeDefined();
		expect(report[0].total_debits).toBeDefined();
		expect(report[0].total_credits).toBeDefined();
		expect(report[0].category_balance).toBeDefined();
	});

	test('generateMarkdownString generates correct markdown string', async () => {
		const data = [
			{
				category: 'TRANSPORT',
				total_debits: 535.08,
				total_credits: 173.06,
				category_balance: 362.02,
			},
			{
				category: 'FOOD/HOME',
				total_debits: 291.83,
				total_credits: 0,
				category_balance: 291.83,
			},
			{
				category: 'ENTERTAIMENT',
				total_debits: 19.99,
				total_credits: 0,
				category_balance: 19.99,
			},
			{
				category: 'EXCHANGE',
				total_debits: 92,
				total_credits: 0,
				category_balance: 92,
			},
		];

		const mdString = Reports.reportMessageOnMarkdown(data);

		expect(mdString).toEqual(expect.stringContaining('Credits: 173.06'));
		expect(mdString).toEqual(expect.stringContaining('Debits: 938.9'));
	});
});
