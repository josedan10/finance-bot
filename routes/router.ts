import express, { Request, Response } from 'express';
import { TelegramRouter as telegramRouter } from './telegram';
import { AIAssistantRouter as aiAssistantRouter } from './ai-assistant';
import { PrismaModule as prisma } from '../modules/database/database.module';
import { requireAuth, requireRole } from '../src/lib/auth.middleware';
import * as CategoryController from '../controllers/categories.controller';
import { NotificationFactory } from '../modules/notifications/notification.module';
import { NotificationPreferenceInput } from '../src/enums/notifications';
import { config } from '../src/config';
import logger from '../src/lib/logger';

const router = express.Router();

router.use((req: Request, res: Response, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
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

router.post('/api/transactions/bulk', requireAuth, async (req: Request, res: Response) => {
	try {
		const { transactions } = req.body as {
			transactions: Array<{
				date: string;
				description: string;
				amount: number;
				category: string;
				type: 'income' | 'expense';
			}>;
		};

		if (!transactions || !Array.isArray(transactions)) {
			return res.status(400).json({ message: 'Invalid transactions data' });
		}

		// Get all unique category names to pre-fetch or create
		const categoryNames = [...new Set(transactions.map(t => t.category))];
		
		const existingCategories = await prisma.category.findMany({
			where: { name: { in: categoryNames }, userId: req.user.id }
		});

		const categoryMap = new Map(existingCategories.map(c => [c.name, c.id]));

		// Create missing categories
		for (const name of categoryNames) {
			if (!categoryMap.has(name)) {
				const newCat = await prisma.category.create({
					data: { name, userId: req.user.id }
				});
				categoryMap.set(name, newCat.id);
			}
		}

		// Prepare data for createMany
		const createdTransactions = await prisma.$transaction(
			transactions.map(t => prisma.transaction.create({
				data: {
					userId: req.user.id,
					date: new Date(t.date),
					description: t.description,
					amount: t.amount,
					currency: 'USD',
					type: t.type === 'income' ? 'credit' : 'debit',
					categoryId: categoryMap.get(t.category),
				},
				include: { category: true }
			}))
		);

		const mapped = createdTransactions.map(t => ({
			id: String(t.id),
			date: t.date.toISOString().split('T')[0],
			description: t.description,
			amount: Number(t.amount),
			category: t.category?.name,
			type: t.type === 'credit' ? 'income' : 'expense',
			source: 'upload',
		}));

		res.status(201).json(mapped);
	} catch (error) {
		logger.error('Failed to bulk create transactions', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to bulk create transactions' });
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

router.patch('/api/transactions/:id/categorize', requireAuth, async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		const { category, keyword } = req.body as { category: string; keyword: string };

		if (Number.isNaN(id) || !category || !keyword) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		// Find or create the category for this user
		let matchedCategory = await prisma.category.findFirst({
			where: { name: category, userId: req.user.id },
		});

		if (!matchedCategory) {
			matchedCategory = await prisma.category.create({
				data: { name: category, userId: req.user.id },
			});
		}

		// Update the transaction
		const updated = await prisma.transaction.update({
			where: { id, userId: req.user.id },
			data: { categoryId: matchedCategory.id },
			include: { category: true },
		});

		// Add the keyword
		const newKeyword = await prisma.keyword.upsert({
			where: { name_userId: { name: keyword.toLowerCase(), userId: req.user.id } },
			update: {},
			create: { name: keyword.toLowerCase(), userId: req.user.id },
		});

		// Link keyword to category
		await prisma.categoryKeyword.upsert({
			where: { categoryId_keywordId: { categoryId: matchedCategory.id, keywordId: newKeyword.id } },
			update: {},
			create: { categoryId: matchedCategory.id, keywordId: newKeyword.id },
		});

		res.status(200).json({
			id: String(updated.id),
			date: updated.date.toISOString().split('T')[0],
			description: updated.description,
			amount: Number(updated.amount),
			category: updated.category?.name,
			type: updated.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
		});
	} catch (error) {
		logger.error('Failed to categorize transaction', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to categorize transaction' });
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

// ============================================
// Notification Preferences API
// ============================================

router.get('/api/notifications/preferences', requireAuth, async (req: Request, res: Response) => {
	try {
		const preferences = await NotificationFactory.getPreferenceService().getPreferences(req.user.id);
		
		if (!preferences) {
			// Return default preferences
			return res.status(200).json({
				emailEnabled: true,
				webPushEnabled: false,
				thresholds: [50, 70, 90],
				disabledCategories: [],
			});
		}

		// Parse thresholds from JSON string
		let thresholds: number[] = [50, 70, 90];
		let disabledCategories: number[] = [];
		
		try {
			if (preferences.thresholds) {
				thresholds = JSON.parse(preferences.thresholds);
			}
			if (preferences.disabledCategories) {
				disabledCategories = JSON.parse(preferences.disabledCategories);
			}
		} catch {
			// Use defaults if parsing fails
		}

		res.status(200).json({
			emailEnabled: preferences.emailEnabled,
			webPushEnabled: preferences.webPushEnabled,
			thresholds,
			disabledCategories,
		});
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch notification preferences' });
	}
});

router.put('/api/notifications/preferences', requireAuth, async (req: Request, res: Response) => {
	try {
		const preferences = req.body as NotificationPreferenceInput;
		
		const updated = await NotificationFactory.getPreferenceService().updatePreferences(
			req.user.id,
			preferences
		);

		// Parse thresholds from JSON string
		let thresholds: number[] = [50, 70, 90];
		let disabledCategories: number[] = [];
		
		try {
			if (updated.thresholds) {
				thresholds = JSON.parse(updated.thresholds);
			}
			if (updated.disabledCategories) {
				disabledCategories = JSON.parse(updated.disabledCategories);
			}
		} catch {
			// Use defaults
		}

		res.status(200).json({
			emailEnabled: updated.emailEnabled,
			webPushEnabled: updated.webPushEnabled,
			thresholds,
			disabledCategories,
		});
	} catch (error) {
		res.status(500).json({ message: 'Failed to update notification preferences' });
	}
});

router.post('/api/notifications/test', requireAuth, async (req: Request, res: Response) => {
	try {
		// Send a test notification to the user
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: { email: true },
		});

		if (!user) {
			return res.status(404).json({ message: 'User not found' });
		}

		// This would trigger a test notification
		// For now, just return success
		res.status(200).json({ 
			message: 'Test notification sent successfully',
			email: user.email 
		});
	} catch (error) {
		res.status(500).json({ message: 'Failed to send test notification' });
	}
});

// Push subscription endpoints
router.post('/api/notifications/push/subscribe', requireAuth, async (req: Request, res: Response) => {
	try {
		const subscription = req.body as {
			endpoint: string;
			keys: {
				p256dh: string;
				auth: string;
			};
			expirationTime?: number | null;
		};

		if (!subscription || !subscription.endpoint || !subscription.keys) {
			return res.status(400).json({ message: 'Invalid push subscription' });
		}

		const result = await NotificationFactory.getWebPushService().saveSubscription(
			req.user.id,
			{
				endpoint: subscription.endpoint,
				keys: subscription.keys,
				expirationTime: subscription.expirationTime,
			}
		);

		res.status(200).json({ 
			message: 'Push subscription saved',
			subscriptionId: result.id 
		});
	} catch (error) {
		logger.error('Failed to save push subscription', {
			error: error instanceof Error ? error.message : 'Unknown error',
			userId: req.user.id,
		});
		res.status(500).json({ message: 'Failed to save push subscription' });
	}
});

router.post('/api/notifications/push/unsubscribe', requireAuth, async (req: Request, res: Response) => {
	try {
		const { endpoint } = req.body as { endpoint?: string };

		if (!endpoint) {
			return res.status(400).json({ message: 'Endpoint is required' });
		}

		await NotificationFactory.getWebPushService().removeSubscriptionByEndpoint(
			req.user.id,
			endpoint
		);

		res.status(200).json({ message: 'Push subscription removed' });
	} catch (error) {
		logger.error('Failed to remove push subscription', {
			error: error instanceof Error ? error.message : 'Unknown error',
			userId: req.user.id,
		});
		res.status(500).json({ message: 'Failed to remove push subscription' });
	}
});

router.get('/api/notifications/push/vapidPublicKey', async (req: Request, res: Response) => {
	// This endpoint is public - returns VAPID public key for frontend to use
	res.status(200).json({ 
		publicKey: config.VAPID_PUBLIC_KEY 
	});
});

router.get('/api/categories/keywords', requireAuth, CategoryController.getCategoriesWithKeywords);

router.use('/api/ai', aiAssistantRouter);
router.use('/telegram', telegramRouter);

export const RouterApp = router;
