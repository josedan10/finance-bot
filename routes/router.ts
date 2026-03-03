import express, { Request, Response } from 'express';
import { TelegramRouter as telegramRouter } from './telegram';
import { PrismaModule as prisma } from '../modules/database/database.module';
import { requireAuth, requireRole } from '../src/lib/auth.middleware';

const router = express.Router();

router.use((req: Request, res: Response, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		return res.sendStatus(204);
	}

	next();
});

router.get('/', (req: Request, res: Response) => {
	res.send('Server is Working with live reload!');
});

router.get('/health', (req: Request, res: Response) => {
	res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/api/transactions', requireAuth, async (req: Request, res: Response) => {
	try {
		const transactions = await prisma.transaction.findMany({
			where: { userId: req.user.id },
			orderBy: { date: 'desc' },
			include: { category: true },
		});

		const mapped = transactions.map((tx) => ({
			id: String(tx.id),
			date: tx.date.toISOString().split('T')[0],
			description: tx.description ?? 'No description',
			amount: Number(tx.amount ?? 0),
			category: tx.category?.name ?? 'Other',
			type: tx.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
		}));

		res.status(200).json(mapped);
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch transactions' });
	}
});

router.post('/api/transactions', requireAuth, async (req: Request, res: Response) => {
	try {
		const { date, description, amount, category, type } = req.body as {
			date?: string;
			description?: string;
			amount?: number;
			category?: string;
			type?: 'income' | 'expense';
		};

		if (!date || !description || amount === undefined || !category || !type) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		const matchedCategory = await prisma.category.findFirst({
			where: { name: category, userId: req.user.id },
		});

		const created = await prisma.transaction.create({
			data: {
				userId: req.user.id,
				date: new Date(date),
				description,
				amount: amount,
				currency: 'USD',
				type: type === 'income' ? 'credit' : 'debit',
				categoryId: matchedCategory?.id,
			},
			include: { category: true },
		});

		res.status(201).json({
			id: String(created.id),
			date: created.date.toISOString().split('T')[0],
			description: created.description ?? 'No description',
			amount: Number(created.amount ?? 0),
			category: created.category?.name ?? category,
			type,
			source: 'manual',
		});
	} catch (error) {
		res.status(500).json({ message: 'Failed to create transaction' });
	}
});

router.delete('/api/transactions/:id', requireAuth, async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		if (Number.isNaN(id)) {
			return res.status(400).json({ message: 'Invalid transaction id' });
		}

		await prisma.transaction.deleteMany({
			where: { id, userId: req.user.id },
		});

		res.status(204).send();
	} catch (error) {
		res.status(500).json({ message: 'Failed to delete transaction' });
	}
});

router.get('/api/budgets', requireAuth, async (req: Request, res: Response) => {
	try {
		const categories = await prisma.category.findMany({
			where: { userId: req.user.id },
			orderBy: { name: 'asc' },
		});

		const budgets = categories
			.filter((category) => category.amountLimit !== null)
			.map((category) => ({
				id: String(category.id),
				category: category.name,
				limit: Number(category.amountLimit ?? 0),
			}));

		res.status(200).json(budgets);
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch budgets' });
	}
});

router.put('/api/budgets/:id', requireAuth, requireRole(['admin', 'operator']), async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		const { limit } = req.body as { limit?: number };

		if (Number.isNaN(id) || limit === undefined) {
			return res.status(400).json({ message: 'Invalid request' });
		}

		const category = await prisma.category.findFirst({
			where: { id, userId: req.user.id }
		});

		if (!category) {
			return res.status(404).json({ message: 'Category not found' });
		}

		const updated = await prisma.category.update({
			where: { id: category.id },
			data: { amountLimit: limit },
		});

		res.status(200).json({
			id: String(updated.id),
			category: updated.name,
			limit: Number(updated.amountLimit ?? 0),
		});
	} catch (error) {
		res.status(500).json({ message: 'Failed to update budget' });
	}
});

router.use('/telegram', telegramRouter);

export const RouterApp = router;
