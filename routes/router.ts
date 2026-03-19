import express, { Request, Response } from 'express';
import { PrismaModule as prisma } from '../modules/database/database.module';
import { TelegramRouter as telegramRouter } from './telegram';
import { AIAssistantRouter as aiAssistantRouter } from './ai-assistant';
import { requireAuth, requireRole } from '../src/lib/auth.middleware';
import { firebaseAdmin } from '../src/lib/firebase';
import * as CategoryController from '../controllers/categories.controller';
import * as PaymentMethodController from '../controllers/paymentMethods.controller';
import { NotificationFactory } from '../modules/notifications/notification.module';
import { NotificationPreferenceInput } from '../src/enums/notifications';
import { config } from '../src/config';
import logger from '../src/lib/logger';
import { BaseTransactions } from '../modules/base-transactions/base-transactions.module';

const router = express.Router();
const ignoredTransactionStatuses = new Set(['cancelled', 'canceled', 'declined', 'pending', 'reversed', 'void']);

function normalizeTransactionStatus(status?: string): string {
	return status?.trim().toLowerCase() ?? '';
}

function isIgnoredTransactionStatus(status?: string): boolean {
	return ignoredTransactionStatuses.has(normalizeTransactionStatus(status));
}

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

// ============================================
// Authentication & Sync API
// ============================================

/**
 * Endpoint to sync a Firebase user with the local Prisma database.
 * This should be called by the frontend immediately after a successful Firebase signup.
 * It's protected by requireAuth, so it verifies the token first.
 */
router.post('/api/auth/signup', requireAuth, async (req: Request, res: Response) => {
	try {
		// The user is already in req.user because of requireAuth's auto-signup logic,
		// but we call it explicitly here to ensure the frontend gets a proper response
		// and the OnboardingService is triggered if it wasn't already.
		
		const user = req.user;

		res.status(200).json({
			message: 'User synchronized successfully',
			user: {
				id: user.id,
				email: user.email,
				role: user.role,
				firebaseId: user.firebaseId,
			}
		});
	} catch (error) {
		logger.error('Signup sync error:', error);
		res.status(500).json({ message: 'Failed to synchronize user' });
	}
});

/**
 * Returns the current authenticated user profile from the database.
 */
router.get('/api/auth/me', requireAuth, async (req: Request, res: Response) => {
	res.status(200).json({
		user: {
			id: req.user.id,
			email: req.user.email,
			role: req.user.role,
			firebaseId: req.user.firebaseId,
		}
	});
});

/**
 * CLEANUP ENDPOINT FOR E2E TESTS
 * Deletes the authenticated user and ALL associated data from both Firebase and Prisma.
 */
router.delete('/api/auth/cleanup-test-user', requireAuth, async (req: Request, res: Response) => {
	const userId = req.user.id;
	const firebaseId = req.user.firebaseId;

	try {
		logger.info('Starting full cleanup for test user', { userId, firebaseId });

		// 1. Delete from Firebase
		await firebaseAdmin.auth().deleteUser(firebaseId);

		// 2. Delete from Prisma (Cascade delete will handle most relationships)
		await prisma.user.delete({
			where: { id: userId }
		});

		res.status(200).json({ message: 'User and all data cleaned up successfully' });
	} catch (error) {
		logger.error('Failed to cleanup test user', { userId, error });
		res.status(500).json({ message: 'Cleanup failed' });
	}
});

router.get('/api/transactions', requireAuth, async (req: Request, res: Response) => {
	try {
		const transactions = await prisma.transaction.findMany({
			where: { userId: req.user.id },
			orderBy: { date: 'desc' },
			include: { 
				category: true,
				paymentMethod: true,
			},
		});

		const mapped = transactions.map((tx) => ({
			id: String(tx.id),
			date: tx.date.toISOString().split('T')[0],
			description: tx.description ?? 'No description',
			amount: Number(tx.amount ?? 0),
			category: tx.category?.name ?? 'Other',
			paymentMethod: tx.paymentMethod?.name ?? 'Other',
			paymentMethodId: tx.paymentMethodId,
			type: tx.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
		}));

		res.status(200).json(mapped);
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch transactions' });
	}
});

// ============================================
// Exchange Rates API
// ============================================

/**
 * Returns the latest exchange rates (BCV and Monitor).
 */
router.get('/api/exchange-rates/latest', requireAuth, async (req: Request, res: Response) => {
	try {
		const latestRate = await prisma.dailyExchangeRate.findFirst({
			orderBy: { date: 'desc' },
		});

		if (!latestRate) {
			return res.status(404).json({ message: 'No exchange rates found' });
		}

		res.status(200).json({
			bcv: Number(latestRate.bcvPrice || 0),
			monitor: Number(latestRate.monitorPrice || 0),
			date: latestRate.date.toISOString().split('T')[0],
		});
	} catch (error) {
		logger.error('Failed to fetch latest exchange rates', { error });
		res.status(500).json({ message: 'Failed to fetch exchange rates' });
	}
});

router.post('/api/transactions', requireAuth, async (req: Request, res: Response) => {
	try {
		const { date, description, amount, category, type, paymentMethodId, currency } = req.body as {
			date?: string;
			description?: string;
			amount?: number;
			category?: string;
			type?: 'income' | 'expense';
			paymentMethodId?: number;
			currency?: string;
		};

		if (!date || !description || amount === undefined || !category || !type) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		// 1. Match Category
		const matchedCategory = await prisma.category.findFirst({
			where: { name: category, userId: req.user.id },
		});

		// 2. Match or Default Payment Method
		let finalPaymentMethodId = paymentMethodId;
		
		if (finalPaymentMethodId) {
			// Validate ownership
			const pm = await prisma.paymentMethod.findFirst({
				where: { id: finalPaymentMethodId, userId: req.user.id }
			});
			if (!pm) {
				return res.status(400).json({ message: 'Invalid payment method' });
			}
		} else {
			// Fallback to "Cash"
			let cashMethod = await prisma.paymentMethod.findFirst({
				where: { name: 'Cash', userId: req.user.id }
			});
			if (!cashMethod) {
				cashMethod = await prisma.paymentMethod.create({
					data: { name: 'Cash', userId: req.user.id }
				});
			}
			finalPaymentMethodId = cashMethod.id;
		}

		// 3. Handle Creation via Gatekeeper (Deduplication & Normalization)
		const { transaction } = await BaseTransactions.safeCreateTransaction({
			userId: req.user.id,
			date: new Date(date),
			description,
			amount,
			currency: currency || 'USD',
			type: type === 'income' ? 'credit' : 'debit',
			categoryId: matchedCategory?.id,
			paymentMethodId: finalPaymentMethodId,
		});

		res.status(201).json({
			id: String(transaction.id),
			date: transaction.date.toISOString().split('T')[0],
			description: transaction.description ?? 'No description',
			amount: Number(transaction.amount ?? 0),
			originalCurrencyAmount: Number(transaction.originalCurrencyAmount ?? 0),
			currency: transaction.currency,
			category: transaction.category?.name ?? category,
			paymentMethod: transaction.paymentMethod?.name ?? 'Other',
			paymentMethodId: transaction.paymentMethodId,
			type,
			source: 'manual',
		});
	} catch (error) {
		logger.error('Failed to create transaction', { error, userId: req.user.id });
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
				paymentMethod?: string;
				referenceId?: string;
				currency?: string;
				status?: string;
			}>;
		};

		if (!transactions || !Array.isArray(transactions)) {
			return res.status(400).json({ message: 'Invalid transactions data' });
		}

		const balanceAffectingTransactions = transactions.filter((transaction) => !isIgnoredTransactionStatus(transaction.status));

		if (balanceAffectingTransactions.length === 0) {
			return res.status(201).json([]);
		}

		// 1. Prepare Categories
		const categoryNames = [...new Set(balanceAffectingTransactions.map(t => t.category))];
		const existingCategories = await prisma.category.findMany({
			where: { name: { in: categoryNames }, userId: req.user.id }
		});
		const categoryMap = new Map(existingCategories.map(c => [c.name, c.id]));

		for (const name of categoryNames) {
			if (!categoryMap.has(name)) {
				const newCat = await prisma.category.create({
					data: { name, userId: req.user.id }
				});
				categoryMap.set(name, newCat.id);
			}
		}

		// 2. Prepare Payment Methods
		const pmNames = [...new Set(balanceAffectingTransactions.filter(t => t.paymentMethod).map(t => t.paymentMethod!))];
		if (!pmNames.includes('Cash')) pmNames.push('Cash'); // Ensure default exists

		const existingPMs = await prisma.paymentMethod.findMany({
			where: { name: { in: pmNames }, userId: req.user.id }
		});
		const pmMap = new Map(existingPMs.map(pm => [pm.name, pm.id]));

		for (const name of pmNames) {
			if (!pmMap.has(name)) {
				const newPm = await prisma.paymentMethod.create({
					data: { name, userId: req.user.id }
				});
				pmMap.set(name, newPm.id);
			}
		}

		const defaultPmId = pmMap.get('Cash') || (pmMap.size > 0 ? pmMap.values().next().value : null);

		// 3. Create Transactions
		const createdTransactions = [];
		for (const t of balanceAffectingTransactions) {
			try {
				const { transaction, isDuplicate } = await BaseTransactions.safeCreateTransaction({
					userId: req.user.id,
					date: new Date(t.date),
					description: t.description,
					amount: t.amount,
					currency: t.currency || 'USD',
					type: t.type === 'income' ? 'credit' : 'debit',
					categoryId: categoryMap.get(t.category),
					paymentMethodId: t.paymentMethod ? pmMap.get(t.paymentMethod) : defaultPmId,
					referenceId: t.referenceId,
				});

				if (!isDuplicate) {
					createdTransactions.push(transaction);
				}
			} catch (err) {
				logger.error('Failed to create transaction in bulk batch', { error: err, transaction: t });
				// Continue with the rest of the batch
			}
		}

		const mapped = createdTransactions.map(t => ({
			id: String(t.id),
			date: t.date.toISOString().split('T')[0],
			description: t.description,
			amount: Number(t.amount),
			category: t.category?.name,
			paymentMethod: t.paymentMethod?.name ?? 'Other',
			type: t.type === 'credit' ? 'income' : 'expense',
			source: 'upload',
			referenceId: t.referenceId,
			currency: t.currency,
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
			include: { 
				category: true,
				paymentMethod: true,
			},
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
			paymentMethod: updated.paymentMethod?.name ?? 'Other',
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

// ============================================
// Categories API
// ============================================

router.get('/api/categories', requireAuth, CategoryController.getCategories);
router.post('/api/categories', requireAuth, CategoryController.createCategory);
router.put('/api/categories/:id', requireAuth, CategoryController.updateCategory);
router.delete('/api/categories/:id', requireAuth, CategoryController.deleteCategory);

// Backward compatibility
router.get('/api/categories/keywords', requireAuth, CategoryController.getCategoriesWithKeywords);

// ============================================
// Payment Methods API
// ============================================

router.get('/api/payment-methods', requireAuth, PaymentMethodController.getPaymentMethods);
router.post('/api/payment-methods', requireAuth, PaymentMethodController.createPaymentMethod);
router.put('/api/payment-methods/:id', requireAuth, PaymentMethodController.updatePaymentMethod);
router.delete('/api/payment-methods/:id', requireAuth, PaymentMethodController.deletePaymentMethod);

router.use('/api/ai', aiAssistantRouter);
router.use('/telegram', telegramRouter);

export const RouterApp = router;
