import { Prisma } from '@prisma/client';
import prisma from '../database/database.module.js';

export class ReportsModule {
	constructor() {
		this._prisma = prisma;
	}

	async getMonthlyReport(monthDate = '01') {
		const date = `2023-${monthDate}-01`;

		return this._prisma.$queryRaw(Prisma.sql`
        SELECT 
          c.name AS category,
          SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) AS total_debits,
          SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) AS total_credits,
          SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END) AS category_balance
        FROM 
          Transaction t
          LEFT JOIN Category c ON t.categoryId = c.id
        WHERE
          t.date >= DATE_FORMAT(${date}, '%Y-%m-%d') 
          AND t.date < DATE_FORMAT(DATE_ADD(${date}, INTERVAL 1 MONTH), '%Y-%m-%d')
        GROUP BY 
          c.id;
    `);
	}

	reportMessageOnMarkdown(reportData) {
		const [balance, ...categories] = reportData;

		// Calculate maximum length of each column
		const columns = [
			{ title: 'Category', key: 'category' },
			{ title: 'Total Debits 💸', key: 'total_debits' },
			{ title: 'Total Credits 💰', key: 'total_credits' },
			// { title: 'Category Balance 💸', key: 'category_balance' }
		];

		const maxColumnLengths = columns.reduce((acc, col) => {
			const maxLength = Math.max(col.title.length, ...categories.map((item) => String(item[col.key]).length));
			acc[col.key] = maxLength;
			return acc;
		}, {});

		let message = `Credits: ${balance.total_credits}
Debits: ${balance.total_debits}
    
`;

		message +=
			columns
				.map((col) => {
					return `| ${col.title}${' '.repeat(maxColumnLengths[col.key] - col.title.length)} `;
				})
				.join('') + '|\n';

		message +=
			columns
				.map((col) => {
					return `|${'-'.repeat(maxColumnLengths[col.key] + 2)}`;
				})
				.join('') + '|\n';

		for (const element of categories) {
			const item = element;
			message +=
				columns
					.map((col) => {
						const value = String(item[col.key]);
						return `| ${value}${' '.repeat(maxColumnLengths[col.key] - value.length)} `;
					})
					.join('') + '|\n';
		}

		return message;
	}
}

export const Reports = new ReportsModule();
