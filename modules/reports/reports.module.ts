import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaModule as prisma } from '../database/database.module';
import dayjs from 'dayjs';

interface ReportRow {
	category: string;
	total_debits: number;
	total_credits: number;
	category_balance: number;
}

interface ReportColumn {
	title: string;
	key: keyof ReportRow;
}

function buildMarkdownTable(columns: ReportColumn[], rows: ReportRow[]): string {
	const maxColumnLengths: Record<string, number> = {};
	for (const col of columns) {
		maxColumnLengths[col.key] = Math.max(col.title.length, ...rows.map((row) => String(row[col.key]).length));
	}

	let table = columns.map((col) => `| ${col.title}${' '.repeat(maxColumnLengths[col.key] - col.title.length)} `).join('') + '|\n';
	table += columns.map((col) => `|${'_'.repeat(maxColumnLengths[col.key] + 2)}`).join('') + '|\n';

	for (const row of rows) {
		table +=
			columns
				.map((col) => {
					const value = String(row[col.key]);
					return `| ${value}${' '.repeat(maxColumnLengths[col.key] - value.length)} `;
				})
				.join('') + '|\n';
	}

	return table;
}

export class ReportsModule {
	private _prisma: PrismaClient;

	constructor() {
		this._prisma = prisma;
	}

	async getMonthlyReport(monthDate: string = '01'): Promise<ReportRow[]> {
		const year = dayjs().year();
		const date = `${year}-${monthDate}-01`;

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

	reportMessageOnMarkdown(reportData: ReportRow[]): string {
		const categories = reportData;
		const balance = { total_credits: 0, total_debits: 0 };

		for (const category of categories) {
			balance.total_credits += Number(category.total_credits);
			balance.total_debits += Number(category.total_debits);
		}

		const columns: ReportColumn[] = [
			{ title: 'Category', key: 'category' },
			{ title: 'Total Debits 💸', key: 'total_debits' },
			{ title: 'Total Credits 💰', key: 'total_credits' },
		];

		let message = `Credits: ${balance.total_credits}\nDebits: ${balance.total_debits}\n    \n`;
		message += buildMarkdownTable(columns, categories);
		return message;
	}
}

export const Reports = new ReportsModule();
