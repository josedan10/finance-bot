import { Prisma, PrismaClient } from '@prisma/client';

export class ReportsModule {
	constructor() {
		this._prisma = new PrismaClient();
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
}

export const Reports = new ReportsModule();
