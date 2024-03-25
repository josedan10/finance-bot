/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: fix types
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaModule as prisma } from '../database/database.module';

export class ReportsModule {
	private _prisma: PrismaClient;

	constructor() {
		this._prisma = prisma;
	}

	async getMonthlyReport(monthDate: string = '01'): Promise<any> {
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

	reportMessageOnMarkdown(reportData: any): string {
		const categories = reportData;
		const balance = {
			total_credits: 0,
			total_debits: 0,
		};

		for (const category of categories) {
			balance.total_credits += Number(category.total_credits);
			balance.total_debits += Number(category.total_debits);
		}

		// Calculate maximum length of each column
		const columns = [
			{ title: 'Category', key: 'category' },
			{ title: 'Total Debits 💸', key: 'total_debits' },
			{ title: 'Total Credits 💰', key: 'total_credits' },
			// { title: 'Category Balance 💸', key: 'category_balance' }
		];

		const maxColumnLengths: { [key: string]: number } = columns.reduce((acc, col) => {
			const maxLength = Math.max(
				col.title.length,
				...categories.map((item: { [x: string]: any }) => String(item[col.key]).length)
			);
			acc[col.key] = maxLength;
			return acc;
		}, {} as { [key: string]: number });

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
					return `|${'_'.repeat(maxColumnLengths[col.key] + 2)}`;
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
