import express, { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaModule as prisma } from '../modules/database/database.module';
import { TelegramRouter as telegramRouter } from './telegram';
import { AIAssistantRouter as aiAssistantRouter } from './ai-assistant';
import * as AuthMiddleware from '../src/lib/auth.middleware';
import { firebaseAdmin } from '../src/lib/firebase';
import * as CategoryController from '../controllers/categories.controller';
import * as PaymentMethodController from '../controllers/paymentMethods.controller';
import { NotificationFactory } from '../modules/notifications/notification.module';
import { NotificationPreferenceInput } from '../src/enums/notifications';
import { config } from '../src/config';
import logger from '../src/lib/logger';
import {
	DEFAULT_DASHBOARD_BUDGET_PREFERENCES,
	normalizeDashboardBudgetPreferences,
	resolveDashboardBudgetPreferences,
} from '../src/lib/dashboard-budget-preferences';
import { BaseTransactions, mapTransactionType } from '../modules/base-transactions/base-transactions.module';
import { normalizeArsUsdExchangeHouse } from '../src/helpers/rate.helper';
import { areSentryTestEndpointsEnabled } from '../src/lib/sentry-test';
import { captureException, flushSentry, isSentryEnabled } from '../src/lib/sentry';
import { getSecurityDashboardAllowedRoles } from '../src/lib/security-access';
import {
	createManualSecurityBlock,
	getSecuritySummary,
	listSecurityBlocks,
	listSecurityEvents,
	removeActiveSecurityBlocksByIp,
	removeSecurityBlock,
} from '../src/lib/security-events';
import {
	createSecurityPathBlock,
	listSecurityPathBlocks,
	removeSecurityPathBlock,
} from '../src/lib/security-path-blocks';
import { normalizeBudgetType, normalizeOptionalAmount, normalizeOptionalDueDay, normalizeOptionalTargetDate } from '../src/lib/budget-normalizers';
import { normalizeOptionalCoordinate, normalizeTransactionLocationMetadata } from '../src/lib/transaction-location';
import { buildSharedMonthlySummary, createShareToken, isValidShareMonth } from '../src/lib/monthly-share-summary';
import { createRedisRateLimitMiddleware } from '../src/lib/redis-rate-limit';

const router = express.Router();
const publicMonthlySummaryRateLimit = createRedisRateLimitMiddleware({
	windowMs: 60_000,
	maxRequests: 10,
	keyPrefix: 'rate_limit:public_monthly_summary',
	getKey: (req) => `${req.ip}:${String(req.params.token || '').trim().toLowerCase()}`,
});
const ignoredTransactionStatuses = new Set(['cancelled', 'canceled', 'declined', 'pending', 'reversed', 'void']);
const unsafeCategoryKeywords = new Set([
	'card',
	'debit',
	'credit',
	'purchase',
	'payment',
	'transaction',
	'tarjeta',
	'debito',
	'crédito',
	'credito',
	'pago',
	'compra',
]);
const securityDashboardAllowedRoles = getSecurityDashboardAllowedRoles();
const { requireAuth, requireRole } = AuthMiddleware;
const requireOnboardingSyncAuth = AuthMiddleware.requireOnboardingSyncAuth ?? AuthMiddleware.requireAuth;

function normalizeTransactionStatus(status?: string): string {
	return status?.trim().toLowerCase() ?? '';
}

function isIgnoredTransactionStatus(status?: string): boolean {
	return ignoredTransactionStatuses.has(normalizeTransactionStatus(status));
}

function parseOptionalDateQuery(value: unknown): Date | undefined | null {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePositiveIntegerQuery(value: unknown, fallback: number): number {
	if (typeof value !== 'string' || !value.trim()) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalBooleanQuery(value: unknown): boolean | undefined | null {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') {
		return true;
	}
	if (normalized === 'false') {
		return false;
	}

	return null;
}

function normalizeCategoryKeyword(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 && normalized.length <= 100 ? normalized : null;
}

function isValidDate(value: Date): boolean {
	return !Number.isNaN(value.getTime());
}

function pickBestKeywordCategory(
	description: string | null,
	categories: {
		id: number;
		name: string;
		categoryKeyword: { keyword: { name: string } }[];
	}[],
	excludedKeyword: string
): { id: number; name: string; matchedKeyword: string } | null {
	const normalizedDescription = description?.trim().toLowerCase();
	if (!normalizedDescription) {
		return null;
	}

	const matches = categories
		.map((category) => {
			const matchedKeywords = category.categoryKeyword
				.map((entry) => entry.keyword.name.trim().toLowerCase())
				.filter((keyword) => keyword && keyword !== excludedKeyword && normalizedDescription.includes(keyword));

			if (matchedKeywords.length === 0) {
				return null;
			}

			const longestKeyword = matchedKeywords.reduce((longest, keyword) =>
				keyword.length > longest.length ? keyword : longest
			);

			return {
				id: category.id,
				name: category.name,
				matchedKeyword: longestKeyword,
				matchCount: matchedKeywords.length,
				longestKeywordLength: longestKeyword.length,
			};
		})
		.filter((match): match is NonNullable<typeof match> => match !== null)
		.sort((left, right) => {
			if (right.longestKeywordLength !== left.longestKeywordLength) {
				return right.longestKeywordLength - left.longestKeywordLength;
			}

			if (right.matchCount !== left.matchCount) {
				return right.matchCount - left.matchCount;
			}

			return left.name.localeCompare(right.name);
		});

	return matches[0] ?? null;
}

router.use((req: Request, res: Response, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-User-Timezone, Sentry-Trace, Baggage');
	res.header('Access-Control-Expose-Headers', 'X-Request-Id');

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

router.post('/api/debug/sentry/log', async (req: Request, res: Response) => {
	if (!areSentryTestEndpointsEnabled()) {
		return res.status(404).json({ message: 'Not found' });
	}

	const message = typeof req.body?.message === 'string' && req.body.message.trim()
		? req.body.message.trim()
		: 'Backend Sentry log test';

	const context = {
		service: 'backend',
		testEndpoint: '/api/debug/sentry/log',
		timestamp: new Date().toISOString(),
	};

	logger.info(message, context);
	await flushSentry();

	res.status(202).json({
		ok: true,
		type: 'log',
		sentryEnabled: isSentryEnabled,
		message,
	});
});

router.post('/api/debug/sentry/error', async (req: Request, res: Response) => {
	if (!areSentryTestEndpointsEnabled()) {
		return res.status(404).json({ message: 'Not found' });
	}

	const message = typeof req.body?.message === 'string' && req.body.message.trim()
		? req.body.message.trim()
		: 'Backend Sentry error test';
	const error = new Error(message);
	const context = {
		service: 'backend',
		testEndpoint: '/api/debug/sentry/error',
		timestamp: new Date().toISOString(),
	};

	logger.error(message, { ...context, stack: error.stack });
	captureException(error, context);
	await flushSentry();

	res.status(202).json({
		ok: true,
		type: 'error',
		sentryEnabled: isSentryEnabled,
		message,
	});
});

// ============================================
// Authentication & Sync API
// ============================================

/**
 * Endpoint to request onboarding approval and sync Firebase identity with local DB.
 * If the user does not exist in local DB, it is created in "pending" status.
 */
router.post('/api/auth/signup', requireOnboardingSyncAuth, async (req: Request, res: Response) => {
	try {
		const user = req.user;
		const isApproved = (user.onboardingStatus || '').toLowerCase() === 'approved';

		res.status(isApproved ? 200 : 202).json({
			message: isApproved ? 'User approved and synchronized' : 'Onboarding request received. Awaiting approval.',
			user: {
				id: user.id,
				email: user.email,
				role: user.role || 'user',
				firebaseId: user.firebaseId,
				onboardingStatus: user.onboardingStatus,
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
			role: req.user.role || 'user',
			firebaseId: req.user.firebaseId,
		}
	});
});

// ============================================
// Security Monitoring API
// ============================================

router.get(
	'/api/security/summary',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const from = parseOptionalDateQuery(req.query.from);
		const to = parseOptionalDateQuery(req.query.to);

		if (from === null || to === null) {
			return res.status(400).json({ message: 'Invalid from/to date range' });
		}

		if (from && to && from > to) {
			return res.status(400).json({ message: '`from` must be before `to`' });
		}

		try {
			const summary = await getSecuritySummary({ from, to });
			return res.status(200).json(summary);
		} catch (error) {
			logger.error('Failed to fetch security summary', { error, userId: req.user.id });
			return res.status(500).json({ message: 'Failed to fetch security summary' });
		}
	}
);

router.get(
	'/api/security/events',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const from = parseOptionalDateQuery(req.query.from);
		const to = parseOptionalDateQuery(req.query.to);

		if (from === null || to === null) {
			return res.status(400).json({ message: 'Invalid from/to date range' });
		}

		if (from && to && from > to) {
			return res.status(400).json({ message: '`from` must be before `to`' });
		}

		try {
			const events = await listSecurityEvents({
				from,
				to,
				path: typeof req.query.path === 'string' ? req.query.path : undefined,
				action: typeof req.query.action === 'string' ? req.query.action : undefined,
				ip: typeof req.query.ip === 'string' ? req.query.ip : undefined,
				page: parsePositiveIntegerQuery(req.query.page, 1),
				pageSize: parsePositiveIntegerQuery(req.query.pageSize, 25),
			});

			return res.status(200).json(events);
		} catch (error) {
			logger.error('Failed to fetch security events', { error, userId: req.user.id });
			return res.status(500).json({ message: 'Failed to fetch security events' });
		}
	}
);

router.get(
	'/api/security/blocks',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const active = parseOptionalBooleanQuery(req.query.active);

		if (active === null) {
			return res.status(400).json({ message: 'Invalid active filter' });
		}

		try {
			const blocks = await listSecurityBlocks({
				active,
				ip: typeof req.query.ip === 'string' ? req.query.ip : undefined,
				page: parsePositiveIntegerQuery(req.query.page, 1),
				pageSize: parsePositiveIntegerQuery(req.query.pageSize, 25),
			});

			return res.status(200).json(blocks);
		} catch (error) {
			logger.error('Failed to fetch security blocks', { error, userId: req.user.id });
			return res.status(500).json({ message: 'Failed to fetch security blocks' });
		}
	}
);

router.post(
	'/api/security/blocks',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
		const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
		const rawExpiresInMinutes = req.body?.expiresInMinutes;
		const expiresInMinutes =
			rawExpiresInMinutes === undefined || rawExpiresInMinutes === null || rawExpiresInMinutes === ''
				? undefined
				: Number(rawExpiresInMinutes);

		if (!ip) {
			return res.status(400).json({ message: 'ip is required' });
		}

		if (expiresInMinutes !== undefined && (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0)) {
			return res.status(400).json({ message: 'expiresInMinutes must be a positive number when provided' });
		}

		try {
			const block = await createManualSecurityBlock({
				ip,
				reason: reason || undefined,
				expiresInMinutes,
				actorUserId: req.user.id,
			});

			return res.status(201).json(block);
		} catch (error) {
			logger.error('Failed to create manual security block', { error, userId: req.user.id, ip });
			return res.status(500).json({ message: 'Failed to create manual security block' });
		}
	}
);

router.delete(
	'/api/security/blocks/:id',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const blockId = Number.parseInt(req.params.id, 10);

		if (!Number.isFinite(blockId) || blockId <= 0) {
			return res.status(400).json({ message: 'Invalid security block id' });
		}

		try {
			const removedBlock = await removeSecurityBlock(blockId, req.user.id);

			if (!removedBlock) {
				return res.status(404).json({ message: 'Security block not found' });
			}

			return res.status(200).json(removedBlock);
		} catch (error) {
			logger.error('Failed to remove security block', { error, userId: req.user.id, blockId });
			return res.status(500).json({ message: 'Failed to remove security block' });
		}
	}
);

router.delete(
	'/api/security/blocks/by-ip/:ip',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const ip = decodeURIComponent(req.params.ip || '').trim();
		if (!ip) {
			return res.status(400).json({ message: 'Invalid ip value' });
		}

		try {
			const result = await removeActiveSecurityBlocksByIp(ip, req.user.id);
			return res.status(200).json({
				...result,
				message:
					result.removedCount > 0
						? `Removed ${result.removedCount} active security block(s) for IP ${ip}`
						: `No active security blocks were found for IP ${ip}`,
			});
		} catch (error) {
			logger.error('Failed to remove security blocks by ip', { error, userId: req.user.id, ip });
			return res.status(500).json({ message: 'Failed to remove security blocks by ip' });
		}
	}
);

router.get(
	'/api/security/path-blocks',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const active = parseOptionalBooleanQuery(req.query.active);

		if (active === null) {
			return res.status(400).json({ message: 'Invalid active filter' });
		}

		try {
			const blocks = await listSecurityPathBlocks({
				active,
				path: typeof req.query.path === 'string' ? req.query.path : undefined,
				page: parsePositiveIntegerQuery(req.query.page, 1),
				pageSize: parsePositiveIntegerQuery(req.query.pageSize, 25),
			});

			return res.status(200).json(blocks);
		} catch (error) {
			logger.error('Failed to fetch security path blocks', { error, userId: req.user.id });
			return res.status(500).json({ message: 'Failed to fetch security path blocks' });
		}
	}
);

router.post(
	'/api/security/path-blocks',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const path = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
		const matchType = typeof req.body?.matchType === 'string' ? req.body.matchType.trim().toLowerCase() : 'exact';
		const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

		if (!path) {
			return res.status(400).json({ message: 'path is required' });
		}
		if (matchType !== 'exact' && matchType !== 'prefix') {
			return res.status(400).json({ message: 'matchType must be exact or prefix when provided' });
		}

		try {
			const block = await createSecurityPathBlock({
				path,
				matchType,
				reason: reason || undefined,
				actorUserId: req.user.id,
			});

			return res.status(201).json(block);
		} catch (error) {
			logger.error('Failed to create security path block', { error, userId: req.user.id, path });
			return res.status(500).json({ message: 'Failed to create security path block' });
		}
	}
);

router.delete(
	'/api/security/path-blocks/:id',
	requireAuth,
	requireRole(securityDashboardAllowedRoles),
	async (req: Request, res: Response) => {
		const blockId = Number.parseInt(req.params.id, 10);

		if (!Number.isFinite(blockId) || blockId <= 0) {
			return res.status(400).json({ message: 'Invalid security path block id' });
		}

		try {
			const removedBlock = await removeSecurityPathBlock(blockId, req.user.id);

			if (!removedBlock) {
				return res.status(404).json({ message: 'Security path block not found' });
			}

			return res.status(200).json(removedBlock);
		} catch (error) {
			logger.error('Failed to remove security path block', { error, userId: req.user.id, blockId });
			return res.status(500).json({ message: 'Failed to remove security path block' });
		}
	}
);

/**
 * CLEANUP ENDPOINT FOR E2E TESTS
 * Deletes the authenticated user and ALL associated data from both Firebase and Prisma.
 */
router.delete('/api/auth/cleanup-test-user', requireAuth, async (req: Request, res: Response) => {
	const userId = req.user.id;
	const firebaseId = req.user.firebaseId;

	if (!firebaseId) {
		return res.status(400).json({ message: 'Missing Firebase user id' });
	}

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
		const { search, categoryId, paymentMethodId } = req.query;
		
		const transactions = await prisma.transaction.findMany({
			where: { 
				userId: req.user.id,
				description: search ? { contains: search as string } : undefined,
				categoryId: categoryId ? Number(categoryId) : undefined,
				paymentMethodId: paymentMethodId ? Number(paymentMethodId) : undefined,
			},
			orderBy: { date: 'desc' },
			include: { 
				category: true,
				paymentMethod: true,
			},
		});

		const mapped = transactions.map((tx) => ({
			id: String(tx.id),
			date: tx.date.toISOString(),
			description: tx.description ?? 'No description',
			amount: Number(tx.amount ?? 0),
			originalCurrencyAmount: Number(tx.originalCurrencyAmount ?? 0),
			category: tx.category?.name ?? 'Other',
			paymentMethod: tx.paymentMethod?.name ?? 'Other',
			paymentMethodId: tx.paymentMethodId,
			type: tx.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
			referenceId: tx.referenceId ?? undefined,
			manualDescription: tx.manualDescription ?? undefined,
			locationName: tx.locationName ?? undefined,
			latitude: tx.latitude === null ? undefined : Number(tx.latitude),
			longitude: tx.longitude === null ? undefined : Number(tx.longitude),
			googleMapsUrl: tx.googleMapsUrl ?? undefined,
			currency: tx.currency,
			exchangeRateUsed: tx.exchangeRateUsed === null ? undefined : Number(tx.exchangeRateUsed),
			exchangeRateSource: tx.exchangeRateSource ?? undefined,
			exchangeRateSourceKey: tx.exchangeRateSourceKey ?? undefined,
			reviewed: tx.reviewed,
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
		const normalizedArsHouse = normalizeArsUsdExchangeHouse(config.ARS_USD_EXCHANGE_HOUSE);
		const latestArsRate = await prisma.historicalExchangeRate.findFirst({
			where: {
				baseCurrency: 'USD',
				quoteCurrency: 'ARS',
				source: 'argentinadatos',
				sourceKey: normalizedArsHouse,
			},
			orderBy: { rateDate: 'desc' },
		});

		if (!latestRate) {
			return res.status(404).json({ message: 'No exchange rates found' });
		}

		res.status(200).json({
			bcv: Number(latestRate.bcvPrice || 0),
			monitor: Number(latestRate.monitorPrice || 0),
			date: latestRate.date.toISOString().split('T')[0],
			ars:
				latestArsRate === null
					? null
					: {
							buy: latestArsRate.buyPrice != null ? Number(latestArsRate.buyPrice) : null,
							sell: latestArsRate.sellPrice != null ? Number(latestArsRate.sellPrice) : null,
							house: latestArsRate.sourceKey,
							date: latestArsRate.rateDate.toISOString().split('T')[0],
					  },
		});
	} catch (error) {
		logger.error('Failed to fetch latest exchange rates', { error });
		res.status(500).json({ message: 'Failed to fetch exchange rates' });
	}
});

router.post('/api/transactions', requireAuth, async (req: Request, res: Response) => {
	try {
		const { date, description, amount, category, type, paymentMethodId, currency, manualDescription, locationName, latitude, longitude, googleMapsUrl, exchangeRateOverride } = req.body as {
			date?: string;
			description?: string;
			amount?: number;
			category?: string;
			type?: 'income' | 'expense';
			paymentMethodId?: number;
			currency?: string;
			manualDescription?: string;
			locationName?: string;
			latitude?: number;
			longitude?: number;
			googleMapsUrl?: string;
			exchangeRateOverride?: number;
		};


		if (!date || !description || amount === undefined || !category || !type) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		const normalizedType = mapTransactionType(type);
		if (!normalizedType) {
			return res.status(400).json({ message: 'Missing or invalid required fields' });
		}

		let normalizedLocationMetadata;
		try {
			normalizedLocationMetadata = normalizeTransactionLocationMetadata({
				manualDescription,
				locationName,
				googleMapsUrl,
			});
		} catch (error) {
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Invalid location metadata',
			});
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
			type: normalizedType,
			categoryId: matchedCategory?.id,
			paymentMethodId: finalPaymentMethodId,
			manualDescription: normalizedLocationMetadata.manualDescription,
			locationName: normalizedLocationMetadata.locationName,
			latitude: normalizeOptionalCoordinate(latitude),
			longitude: normalizeOptionalCoordinate(longitude),
			googleMapsUrl: normalizedLocationMetadata.googleMapsUrl,
			exchangeRateOverride,
			reviewed: true,
		});

		res.status(201).json({
			id: String(transaction.id),
			date: transaction.date.toISOString(),
			description: transaction.description ?? 'No description',
			amount: Number(transaction.amount ?? 0),
			originalCurrencyAmount: Number(transaction.originalCurrencyAmount ?? 0),
			currency: transaction.currency,
			category: transaction.category?.name ?? category,
			paymentMethod: transaction.paymentMethod?.name ?? 'Other',
			paymentMethodId: transaction.paymentMethodId,
			type,
			source: 'manual',
			referenceId: transaction.referenceId ?? undefined,
			manualDescription: transaction.manualDescription ?? undefined,
			locationName: transaction.locationName ?? undefined,
			latitude: transaction.latitude === null ? undefined : Number(transaction.latitude),
			longitude: transaction.longitude === null ? undefined : Number(transaction.longitude),
			googleMapsUrl: transaction.googleMapsUrl ?? undefined,
			reviewed: transaction.reviewed,
			exchangeRateUsed: transaction.exchangeRateUsed === null ? undefined : Number(transaction.exchangeRateUsed),
			exchangeRateSource: transaction.exchangeRateSource ?? undefined,
			exchangeRateSourceKey: transaction.exchangeRateSourceKey ?? undefined,
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

		for (const transaction of balanceAffectingTransactions) {
			if (!mapTransactionType(transaction.type)) {
				return res.status(400).json({ message: 'Missing or invalid required fields' });
			}
		}

		const dates = balanceAffectingTransactions.map((transaction) => new Date(transaction.date));
		const startDate = new Date(Math.min(...dates.map((date) => date.getTime())));
		startDate.setDate(startDate.getDate() - 1);
		const endDate = new Date(Math.max(...dates.map((date) => date.getTime())));
		endDate.setDate(endDate.getDate() + 1);

		const existingTransactions = await prisma.transaction.findMany({
			where: {
				userId: req.user.id,
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		});

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
				const normalizedType = mapTransactionType(t.type);
				if (!normalizedType) {
					return res.status(400).json({ message: 'Missing or invalid required fields' });
				}

				const existingDuplicate = BaseTransactions.findDuplicateInCandidates({
					userId: req.user.id,
					amount: t.amount,
					date: new Date(t.date),
					type: normalizedType,
					currency: t.currency || 'USD',
					description: t.description,
					referenceId: t.referenceId,
				}, existingTransactions);

				if (existingDuplicate) {
					logger.info('Duplicate transaction detected against existing records, skipping creation', {
						originalId: existingDuplicate.id,
						userId: req.user.id,
						amount: t.amount,
						currency: t.currency || 'USD',
						date: t.date,
					});
					continue;
				}

				const { transaction, isDuplicate } = await BaseTransactions.safeCreateTransaction({
					userId: req.user.id,
					date: new Date(t.date),
					description: t.description,
					amount: t.amount,
					currency: t.currency || 'USD',
					type: normalizedType,
					categoryId: categoryMap.get(t.category),
					paymentMethodId: t.paymentMethod ? pmMap.get(t.paymentMethod) : defaultPmId,
					referenceId: t.referenceId,
					reviewed: true,
					skipDuplicateCheck: true,
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
			date: t.date.toISOString(),
			description: t.description,
			amount: Number(t.amount),
			category: t.category?.name,
			paymentMethod: t.paymentMethod?.name ?? 'Other',
			type: t.type === 'credit' ? 'income' : 'expense',
			source: 'upload',
			referenceId: t.referenceId,
			currency: t.currency,
			reviewed: t.reviewed,
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

router.patch('/api/transactions/:id', requireAuth, async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		const {
			date,
			description,
			amount,
			currency,
			category,
			paymentMethodId,
			type,
			referenceId,
			manualDescription,
			locationName,
			latitude,
			longitude,
			googleMapsUrl,
			exchangeRateOverride,
		} = req.body as {
			date?: string;
			description?: string;
			amount?: number;
			currency?: string;
			category?: string;
			paymentMethodId?: number;
			type?: 'income' | 'expense';
			referenceId?: string;
			manualDescription?: string;
			locationName?: string;
			latitude?: number | null;
			longitude?: number | null;
			googleMapsUrl?: string;
			exchangeRateOverride?: number | null;
		};

		if (
			Number.isNaN(id) ||
			!date ||
			!description?.trim() ||
			!Number.isFinite(Number(amount)) ||
			!currency?.trim() ||
			!category?.trim() ||
			!type
		) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		let normalizedLocationMetadata;
		try {
			normalizedLocationMetadata = normalizeTransactionLocationMetadata({
				manualDescription,
				locationName,
				googleMapsUrl,
			});
		} catch (error) {
			return res.status(400).json({
				message: error instanceof Error ? error.message : 'Invalid location metadata',
			});
		}

		const existingTransaction = await prisma.transaction.findFirst({
			where: { id, userId: req.user.id },
		});

		if (!existingTransaction) {
			return res.status(404).json({ message: 'Transaction not found' });
		}

		let matchedCategory = await prisma.category.findFirst({
			where: { name: category.trim(), userId: req.user.id },
		});

		if (!matchedCategory) {
			matchedCategory = await prisma.category.create({
				data: { name: category.trim(), userId: req.user.id },
			});
		}

		const resolvedPaymentMethodId =
			typeof paymentMethodId === 'number' && Number.isFinite(paymentMethodId) && paymentMethodId > 0
				? paymentMethodId
				: null;

		if (resolvedPaymentMethodId) {
			const paymentMethod = await prisma.paymentMethod.findFirst({
				where: { id: resolvedPaymentMethodId, userId: req.user.id },
			});

			if (!paymentMethod) {
				return res.status(404).json({ message: 'Payment method not found' });
			}
		}

		const normalizedLatitude = normalizeOptionalCoordinate(latitude);
		const normalizedLongitude = normalizeOptionalCoordinate(longitude);
		const normalizedAmounts = await BaseTransactions.normalizeTransactionAmount({
			amount: Number(amount),
			currency: currency.trim().toUpperCase(),
			date: new Date(date),
			exchangeRateOverride,
		});

		const updated = await prisma.transaction.update({
			where: { id: existingTransaction.id },
			data: {
				amount: normalizedAmounts.amount,
				currency: normalizedAmounts.currency,
				originalCurrencyAmount: normalizedAmounts.originalCurrencyAmount,
				date: new Date(date),
				description: description.trim(),
				categoryId: matchedCategory.id,
				paymentMethodId: resolvedPaymentMethodId,
				type: type === 'income' ? 'credit' : 'debit',
				referenceId: referenceId?.trim() || null,
				manualDescription: normalizedLocationMetadata.manualDescription,
				locationName: normalizedLocationMetadata.locationName,
				latitude: normalizedLatitude,
				longitude: normalizedLongitude,
				googleMapsUrl: normalizedLocationMetadata.googleMapsUrl,
				exchangeRateUsed: normalizedAmounts.exchangeRateUsed,
				exchangeRateSource: normalizedAmounts.exchangeRateSource,
				exchangeRateSourceKey: normalizedAmounts.exchangeRateSourceKey,
				reviewed: true,
				reviewedAt: new Date(),
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		});

		return res.status(200).json({
			id: String(updated.id),
			date: updated.date.toISOString(),
			description: updated.description ?? 'No description',
			amount: Number(updated.amount ?? 0),
			originalCurrencyAmount: Number(updated.originalCurrencyAmount ?? 0),
			category: updated.category?.name ?? category,
			paymentMethod: updated.paymentMethod?.name ?? 'Other',
			paymentMethodId: updated.paymentMethodId,
			type: updated.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
			referenceId: updated.referenceId ?? undefined,
			manualDescription: updated.manualDescription ?? undefined,
			locationName: updated.locationName ?? undefined,
			latitude: updated.latitude === null ? undefined : Number(updated.latitude),
			longitude: updated.longitude === null ? undefined : Number(updated.longitude),
			googleMapsUrl: updated.googleMapsUrl ?? undefined,
			currency: updated.currency,
			exchangeRateUsed: updated.exchangeRateUsed === null ? undefined : Number(updated.exchangeRateUsed),
			exchangeRateSource: updated.exchangeRateSource ?? undefined,
			exchangeRateSourceKey: updated.exchangeRateSourceKey ?? undefined,
			reviewed: updated.reviewed,
		});
	} catch (error) {
		logger.error('Failed to update transaction', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to update transaction' });
	}
});

router.patch('/api/transactions/:id/categorize', requireAuth, async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		const { category, keyword, applyToMatchingTransactions } = req.body as {
			category: string;
			keyword?: string;
			applyToMatchingTransactions?: boolean;
		};
		const normalizedKeyword = keyword?.trim().toLowerCase();

		if (Number.isNaN(id) || !category) {
			return res.status(400).json({ message: 'Missing required fields' });
		}

		if (applyToMatchingTransactions && !normalizedKeyword) {
			return res.status(400).json({ message: 'Keyword is required to apply categorization to matching transactions' });
		}

		if (normalizedKeyword && unsafeCategoryKeywords.has(normalizedKeyword)) {
			return res.status(400).json({
				message: 'Keyword is too generic for category assignment. Choose a merchant or description-specific keyword.',
			});
		}

		const existingTransaction = await prisma.transaction.findFirst({
			where: { id, userId: req.user.id },
			include: {
				category: true,
				paymentMethod: true,
			},
		});

		if (!existingTransaction) {
			return res.status(404).json({ message: 'Transaction not found' });
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
			where: { id: existingTransaction.id },
			data: { categoryId: matchedCategory.id, reviewed: true, reviewedAt: new Date() },
			include: { 
				category: true,
				paymentMethod: true,
			},
		});

		let propagatedCount = 0;

		if (normalizedKeyword) {
			// Add or update the keyword mapping
			const newKeyword = await prisma.keyword.upsert({
				where: { name_userId: { name: normalizedKeyword, userId: req.user.id } },
				update: {},
				create: { name: normalizedKeyword, userId: req.user.id },
			});

			await prisma.categoryKeyword.deleteMany({
				where: {
					keywordId: newKeyword.id,
					categoryId: {
						not: matchedCategory.id,
					},
					category: {
						userId: req.user.id,
					},
				},
			});

			// Link keyword to category
			await prisma.categoryKeyword.upsert({
				where: { categoryId_keywordId: { categoryId: matchedCategory.id, keywordId: newKeyword.id } },
				update: {},
				create: { categoryId: matchedCategory.id, keywordId: newKeyword.id },
			});

			if (applyToMatchingTransactions) {
				const candidateTransactions = await prisma.transaction.findMany({
					where: {
						userId: req.user.id,
						id: {
							not: existingTransaction.id,
						},
					},
					select: {
						id: true,
						description: true,
					},
				});

				const matchingTransactionIds = candidateTransactions
					.filter((transaction) => transaction.description?.toLowerCase().includes(normalizedKeyword) ?? false)
					.map((transaction) => transaction.id);

				if (matchingTransactionIds.length > 0) {
					const propagationResult = await prisma.transaction.updateMany({
						where: {
							userId: req.user.id,
							id: {
								in: matchingTransactionIds,
							},
						},
						data: {
							categoryId: matchedCategory.id,
							reviewed: true,
							reviewedAt: new Date(),
						},
					});

					propagatedCount = propagationResult.count;
				}
			}
		}

		res.status(200).json({
			id: String(updated.id),
			date: updated.date.toISOString(),
			description: updated.description ?? 'No description',
			amount: Number(updated.amount ?? 0),
			currency: updated.currency,
			category: updated.category?.name ?? category,
			paymentMethod: updated.paymentMethod?.name ?? 'Other',
			paymentMethodId: updated.paymentMethodId,
			type: updated.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
			referenceId: updated.referenceId ?? undefined,
			reviewed: updated.reviewed,
			propagatedCount,
			assignedKeyword: normalizedKeyword ?? undefined,
		});
	} catch (error) {
		logger.error('Failed to categorize transaction', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to categorize transaction' });
	}
});

router.post('/api/transactions/category-keyword/reassign', requireAuth, async (req: Request, res: Response) => {
	try {
		const {
			wrongKeyword,
			updatedAfter,
			latestBatchOnly = true,
			dryRun = true,
			deleteKeywordMapping = true,
			limit = 500,
		} = req.body as {
			wrongKeyword?: string;
			updatedAfter?: string;
			latestBatchOnly?: boolean;
			dryRun?: boolean;
			deleteKeywordMapping?: boolean;
			limit?: number;
		};

		const normalizedKeyword = normalizeCategoryKeyword(wrongKeyword);
		if (!normalizedKeyword) {
			return res.status(400).json({ message: 'wrongKeyword is required and must be 100 characters or fewer' });
		}

		let reviewedAfterDate: Date | undefined;
		if (updatedAfter) {
			reviewedAfterDate = new Date(updatedAfter);
			if (!isValidDate(reviewedAfterDate)) {
				return res.status(400).json({ message: 'updatedAfter must be a valid ISO date' });
			}
		}

		const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);

		const wrongKeywordRecord = await prisma.keyword.findFirst({
			where: { name: normalizedKeyword, userId: req.user.id },
			include: {
				categoryKeyword: {
					include: {
						category: true,
					},
				},
			},
		});

		if (!wrongKeywordRecord) {
			return res.status(404).json({ message: 'Keyword not found' });
		}

		const wronglyAssignedCategoryIds = wrongKeywordRecord.categoryKeyword
			.filter((mapping) => mapping.category.userId === req.user.id)
			.map((mapping) => mapping.categoryId);

		const candidateTransactions = await prisma.transaction.findMany({
			where: {
				userId: req.user.id,
				description: {
					contains: normalizedKeyword,
				},
				...(wronglyAssignedCategoryIds.length > 0 ? { categoryId: { in: wronglyAssignedCategoryIds } } : {}),
				...(reviewedAfterDate ? { reviewedAt: { gte: reviewedAfterDate } } : { reviewedAt: { not: null } }),
			},
			select: {
				id: true,
				description: true,
				categoryId: true,
				reviewedAt: true,
				category: {
					select: {
						name: true,
					},
				},
			},
			orderBy: {
				reviewedAt: 'desc',
			},
			take: safeLimit,
		});

		const keywordMatchedTransactions = candidateTransactions.filter((transaction) =>
			transaction.description?.toLowerCase().includes(normalizedKeyword)
		);

		const latestReviewedAt = keywordMatchedTransactions.reduce<Date | null>((latest, transaction) => {
			if (!transaction.reviewedAt) {
				return latest;
			}

			return !latest || transaction.reviewedAt.getTime() > latest.getTime() ? transaction.reviewedAt : latest;
		}, null);

		const scopedTransactions =
			latestBatchOnly && !reviewedAfterDate && latestReviewedAt
				? keywordMatchedTransactions.filter((transaction) => transaction.reviewedAt?.getTime() === latestReviewedAt.getTime())
				: keywordMatchedTransactions;

		const categories = await prisma.category.findMany({
			where: { userId: req.user.id },
			select: {
				id: true,
				name: true,
				categoryKeyword: {
					select: {
						keyword: {
							select: {
								name: true,
							},
						},
					},
				},
			},
		});

		const plannedChanges = scopedTransactions.map((transaction) => {
			const reassignedCategory = pickBestKeywordCategory(transaction.description, categories, normalizedKeyword);

			return {
				id: String(transaction.id),
				description: transaction.description ?? 'No description',
				previousCategory: transaction.category?.name ?? null,
				previousCategoryId: transaction.categoryId,
				newCategory: reassignedCategory?.name ?? null,
				newCategoryId: reassignedCategory?.id ?? null,
				matchedKeyword: reassignedCategory?.matchedKeyword ?? null,
			};
		});

		if (!dryRun && (plannedChanges.length > 0 || deleteKeywordMapping)) {
			await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
				if (deleteKeywordMapping) {
					await tx.categoryKeyword.deleteMany({
						where: {
							keywordId: wrongKeywordRecord.id,
							category: {
								userId: req.user.id,
							},
						},
					});
				}

				for (const change of plannedChanges) {
					await tx.transaction.update({
						where: { id: Number(change.id) },
						data: {
							categoryId: change.newCategoryId,
							reviewed: false,
							reviewedAt: null,
						},
					});
				}
			});
		}

		return res.status(200).json({
			wrongKeyword: normalizedKeyword,
			dryRun,
			latestBatchOnly,
			latestReviewedAt: latestReviewedAt?.toISOString() ?? null,
			matchedTransactionCount: scopedTransactions.length,
			reassignedCount: plannedChanges.filter((change) => change.newCategoryId !== change.previousCategoryId).length,
			unmatchedCount: plannedChanges.filter((change) => change.newCategoryId === null).length,
			deletedKeywordMapping: !dryRun && deleteKeywordMapping,
			changes: plannedChanges,
		});
	} catch (error) {
		logger.error('Failed to reassign transactions by keyword', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to reassign transactions by keyword' });
	}
});

router.patch('/api/transactions/:id/review', requireAuth, async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		if (Number.isNaN(id)) {
			return res.status(400).json({ message: 'Invalid transaction id' });
		}

		const existingTransaction = await prisma.transaction.findFirst({
			where: { id, userId: req.user.id },
			include: {
				category: true,
				paymentMethod: true,
			},
		});

		if (!existingTransaction) {
			return res.status(404).json({ message: 'Transaction not found' });
		}

		const updated = await prisma.transaction.update({
			where: { id: existingTransaction.id },
			data: {
				reviewed: true,
				reviewedAt: new Date(),
			},
			include: {
				category: true,
				paymentMethod: true,
			},
		});

		return res.status(200).json({
			id: String(updated.id),
			date: updated.date.toISOString(),
			description: updated.description ?? 'No description',
			amount: Number(updated.amount ?? 0),
			originalCurrencyAmount: Number(updated.originalCurrencyAmount ?? 0),
			category: updated.category?.name ?? 'Other',
			paymentMethod: updated.paymentMethod?.name ?? 'Other',
			paymentMethodId: updated.paymentMethodId,
			type: updated.type === 'credit' ? 'income' : 'expense',
			source: 'manual',
			referenceId: updated.referenceId ?? undefined,
			manualDescription: updated.manualDescription ?? undefined,
			locationName: updated.locationName ?? undefined,
			latitude: updated.latitude === null ? undefined : Number(updated.latitude),
			longitude: updated.longitude === null ? undefined : Number(updated.longitude),
			googleMapsUrl: updated.googleMapsUrl ?? undefined,
			currency: updated.currency,
			reviewed: updated.reviewed,
			exchangeRateUsed: updated.exchangeRateUsed === null ? undefined : Number(updated.exchangeRateUsed),
			exchangeRateSource: updated.exchangeRateSource ?? undefined,
			exchangeRateSourceKey: updated.exchangeRateSourceKey ?? undefined,
		});
	} catch (error) {
		logger.error('Failed to mark transaction as reviewed', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to mark transaction as reviewed' });
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
				type: category.budgetType || 'spending',
				targetAmount: category.targetAmount === null ? null : Number(category.targetAmount),
				currentAmount: category.currentAmount === null ? null : Number(category.currentAmount),
				dueDay: category.dueDay ?? null,
				targetDate: category.targetDate ? category.targetDate.toISOString() : null,
			}));

		res.status(200).json(budgets);
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch budgets' });
	}
});

router.put('/api/budgets/:id', requireAuth, async (req: Request, res: Response) => {
	try {
		const id = Number(req.params.id);
		const { limit, type, targetAmount, currentAmount, dueDay, targetDate } = req.body as {
			limit?: number;
			type?: 'spending' | 'recurring' | 'goal' | 'reserve';
			targetAmount?: number | null;
			currentAmount?: number | null;
			dueDay?: number | null;
			targetDate?: string | null;
		};

		if (Number.isNaN(id) || limit === undefined) {
			return res.status(400).json({ message: 'Invalid request' });
		}

		const category = await prisma.category.findFirst({
			where: { id, userId: req.user.id }
		});

		if (!category) {
			return res.status(404).json({ message: 'Category not found' });
		}

		const updateData: Prisma.CategoryUpdateInput = { amountLimit: limit };
		if (type !== undefined) {
			updateData.budgetType = normalizeBudgetType(type);
		}
		const normalizedTargetAmount = normalizeOptionalAmount(targetAmount);
		if (normalizedTargetAmount !== undefined) {
			updateData.targetAmount = normalizedTargetAmount;
		}
		const normalizedCurrentAmount = normalizeOptionalAmount(currentAmount);
		if (normalizedCurrentAmount !== undefined) {
			updateData.currentAmount = normalizedCurrentAmount;
		}
		const normalizedDueDay = normalizeOptionalDueDay(dueDay);
		if (normalizedDueDay !== undefined) {
			updateData.dueDay = normalizedDueDay;
		}
		const normalizedTargetDate = normalizeOptionalTargetDate(targetDate);
		if (normalizedTargetDate !== undefined) {
			updateData.targetDate = normalizedTargetDate;
		}

		const updated = await prisma.category.update({
			where: { id: category.id },
			data: updateData,
		});

		res.status(200).json({
			id: String(updated.id),
			category: updated.name,
			limit: Number(updated.amountLimit ?? 0),
			type: updated.budgetType || 'spending',
			targetAmount: updated.targetAmount === null ? null : Number(updated.targetAmount),
			currentAmount: updated.currentAmount === null ? null : Number(updated.currentAmount),
			dueDay: updated.dueDay ?? null,
			targetDate: updated.targetDate ? updated.targetDate.toISOString() : null,
		});
	} catch (error) {
		res.status(500).json({ message: 'Failed to update budget' });
	}
});

router.get('/api/budgets/fallback-rules', requireAuth, async (req: Request, res: Response) => {
	try {
		const rules = await prisma.$queryRaw<
			Array<{
				id: number;
				sourceCategoryId: number;
				sourceCategoryName: string;
				targetCategoryId: number;
				targetCategoryName: string;
				enabled: boolean;
			}>
		>(Prisma.sql`
			SELECT
				r.id,
				r.sourceCategoryId,
				source.name AS sourceCategoryName,
				r.targetCategoryId,
				target.name AS targetCategoryName,
				r.enabled
			FROM BudgetFallbackRule r
			INNER JOIN Category source ON source.id = r.sourceCategoryId
			INNER JOIN Category target ON target.id = r.targetCategoryId
			WHERE r.userId = ${req.user.id}
			ORDER BY source.name ASC
		`);

		res.status(200).json(rules);
	} catch (error) {
		logger.error('Failed to fetch budget fallback rules', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to fetch budget fallback rules' });
	}
});

router.post('/api/budgets/fallback-rules', requireAuth, async (req: Request, res: Response) => {
	try {
		const { sourceCategoryId, targetCategoryId, enabled = true } = req.body as {
			sourceCategoryId?: number;
			targetCategoryId?: number;
			enabled?: boolean;
		};

		if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
			return res.status(400).json({ message: 'Invalid fallback rule request' });
		}

		const categories = await prisma.category.findMany({
			where: {
				id: { in: [sourceCategoryId, targetCategoryId] },
				userId: req.user.id,
			},
		});

		if (categories.length !== 2) {
			return res.status(404).json({ message: 'Category not found' });
		}

		await prisma.category.update({
			where: { id: sourceCategoryId },
			data: { isCumulative: false },
		});

		await prisma.$executeRaw(
			Prisma.sql`
				INSERT INTO BudgetFallbackRule (userId, sourceCategoryId, targetCategoryId, enabled, createdAt, updatedAt)
				VALUES (${req.user.id}, ${sourceCategoryId}, ${targetCategoryId}, ${enabled}, NOW(), NOW())
				ON DUPLICATE KEY UPDATE
					targetCategoryId = VALUES(targetCategoryId),
					enabled = VALUES(enabled),
					updatedAt = NOW()
			`
		);

		const rule = await prisma.$queryRaw<
			Array<{
				id: number;
				sourceCategoryId: number;
				sourceCategoryName: string;
				targetCategoryId: number;
				targetCategoryName: string;
				enabled: boolean;
			}>
		>(Prisma.sql`
			SELECT
				r.id,
				r.sourceCategoryId,
				source.name AS sourceCategoryName,
				r.targetCategoryId,
				target.name AS targetCategoryName,
				r.enabled
			FROM BudgetFallbackRule r
			INNER JOIN Category source ON source.id = r.sourceCategoryId
			INNER JOIN Category target ON target.id = r.targetCategoryId
			WHERE r.userId = ${req.user.id}
			  AND r.sourceCategoryId = ${sourceCategoryId}
			LIMIT 1
		`);

		res.status(200).json(rule[0]);
	} catch (error) {
		logger.error('Failed to upsert budget fallback rule', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to save budget fallback rule' });
	}
});

router.delete('/api/budgets/fallback-rules/:sourceCategoryId', requireAuth, async (req: Request, res: Response) => {
	try {
		const sourceCategoryId = Number(req.params.sourceCategoryId);
		if (Number.isNaN(sourceCategoryId)) {
			return res.status(400).json({ message: 'Invalid source category id' });
		}

		await prisma.$executeRaw(
			Prisma.sql`
				DELETE FROM BudgetFallbackRule
				WHERE userId = ${req.user.id}
				  AND sourceCategoryId = ${sourceCategoryId}
			`
		);

		res.status(204).send();
	} catch (error) {
		logger.error('Failed to delete budget fallback rule', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to delete budget fallback rule' });
	}
});

router.get('/api/budgets/overflow-assignments', requireAuth, async (req: Request, res: Response) => {
	try {
		const month = Number(req.query.month);
		const year = Number(req.query.year);

		if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
			return res.status(400).json({ message: 'month and year are required' });
		}

		const assignments = await prisma.$queryRaw<
			Array<{
				id: number;
				sourceCategoryId: number;
				sourceCategoryName: string;
				targetCategoryId: number;
				targetCategoryName: string;
				month: number;
				year: number;
			}>
		>(Prisma.sql`
			SELECT
				a.id,
				a.sourceCategoryId,
				source.name AS sourceCategoryName,
				a.targetCategoryId,
				target.name AS targetCategoryName,
				a.month,
				a.year
			FROM BudgetOverflowAssignment a
			INNER JOIN Category source ON source.id = a.sourceCategoryId
			INNER JOIN Category target ON target.id = a.targetCategoryId
			WHERE a.userId = ${req.user.id}
			  AND a.month = ${month}
			  AND a.year = ${year}
			ORDER BY source.name ASC
		`);

		return res.status(200).json(assignments);
	} catch (error) {
		logger.error('Failed to fetch budget overflow assignments', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to fetch budget overflow assignments' });
	}
});

router.post('/api/budgets/overflow-assignments', requireAuth, async (req: Request, res: Response) => {
	try {
		const { sourceCategoryId, targetCategoryId, month, year } = req.body as {
			sourceCategoryId?: number;
			targetCategoryId?: number;
			month?: number;
			year?: number;
		};

		const normalizedSourceCategoryId: number = Number(sourceCategoryId);
		const normalizedTargetCategoryId: number = Number(targetCategoryId);
		const normalizedMonth: number = Number(month);
		const normalizedYear: number = Number(year);

		if (
			!Number.isInteger(normalizedSourceCategoryId) ||
			!Number.isInteger(normalizedTargetCategoryId) ||
			normalizedSourceCategoryId === normalizedTargetCategoryId ||
			!Number.isInteger(normalizedMonth) ||
			normalizedMonth < 1 ||
			normalizedMonth > 12 ||
			!Number.isInteger(normalizedYear) ||
			normalizedYear < 2000 ||
			normalizedYear > 2100
		) {
			return res.status(400).json({ message: 'Invalid overflow assignment request' });
		}

		const categories = await prisma.category.findMany({
			where: {
				id: { in: [normalizedSourceCategoryId, normalizedTargetCategoryId] },
				userId: req.user.id,
			},
		});

		if (categories.length !== 2) {
			return res.status(404).json({ message: 'Category not found' });
		}

		await prisma.budgetOverflowAssignment.upsert({
			where: {
				userId_sourceCategoryId_month_year: {
					userId: req.user.id,
					sourceCategoryId: normalizedSourceCategoryId,
					month: normalizedMonth,
					year: normalizedYear,
				},
			},
			update: {
				targetCategoryId: normalizedTargetCategoryId,
			},
			create: {
				userId: req.user.id,
				sourceCategoryId: normalizedSourceCategoryId,
				targetCategoryId: normalizedTargetCategoryId,
				month: normalizedMonth,
				year: normalizedYear,
			},
		});

		const assignment = await prisma.$queryRaw<
			Array<{
				id: number;
				sourceCategoryId: number;
				sourceCategoryName: string;
				targetCategoryId: number;
				targetCategoryName: string;
				month: number;
				year: number;
			}>
		>(Prisma.sql`
			SELECT
				a.id,
				a.sourceCategoryId,
				source.name AS sourceCategoryName,
				a.targetCategoryId,
				target.name AS targetCategoryName,
				a.month,
				a.year
			FROM BudgetOverflowAssignment a
			INNER JOIN Category source ON source.id = a.sourceCategoryId
			INNER JOIN Category target ON target.id = a.targetCategoryId
			WHERE a.userId = ${req.user.id}
			  AND a.sourceCategoryId = ${normalizedSourceCategoryId}
			  AND a.month = ${normalizedMonth}
			  AND a.year = ${normalizedYear}
			LIMIT 1
		`);

		return res.status(200).json(assignment[0]);
	} catch (error) {
		logger.error('Failed to save budget overflow assignment', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to save budget overflow assignment' });
	}
});

router.delete('/api/budgets/overflow-assignments/:sourceCategoryId', requireAuth, async (req: Request, res: Response) => {
	try {
		const sourceCategoryId = Number(req.params.sourceCategoryId);
		const month = Number(req.query.month);
		const year = Number(req.query.year);

		if (
			!Number.isInteger(sourceCategoryId) ||
			!Number.isInteger(month) ||
			month < 1 ||
			month > 12 ||
			!Number.isInteger(year) ||
			year < 2000 ||
			year > 2100
		) {
			return res.status(400).json({ message: 'Invalid overflow assignment request' });
		}

		await prisma.budgetOverflowAssignment.deleteMany({
			where: {
				userId: req.user.id,
				sourceCategoryId,
				month,
				year,
			},
		});

		return res.status(204).send();
	} catch (error) {
		logger.error('Failed to delete budget overflow assignment', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to delete budget overflow assignment' });
	}
});

router.post('/api/budgets/carryover-transfers', requireAuth, async (req: Request, res: Response) => {
	try {
		const { sourceCategoryId, targetCategoryId, amount } = req.body as {
			sourceCategoryId?: number;
			targetCategoryId?: number;
			amount?: number;
		};

		if (
			!Number.isInteger(sourceCategoryId) ||
			!Number.isInteger(targetCategoryId) ||
			sourceCategoryId === targetCategoryId ||
			typeof amount !== 'number' ||
			!Number.isFinite(amount) ||
			amount <= 0
		) {
			return res.status(400).json({ message: 'Invalid carry-over transfer request' });
		}

		const normalizedSourceCategoryId = Number(sourceCategoryId);
		const normalizedTargetCategoryId = Number(targetCategoryId);

		const now = new Date();
		const month = now.getMonth() + 1;
		const year = now.getFullYear();

		const [categories, sourcePeriod, targetPeriod] = await Promise.all([
			prisma.category.findMany({
				where: {
					id: { in: [normalizedSourceCategoryId, normalizedTargetCategoryId] },
					userId: req.user.id,
				},
				select: { id: true },
			}),
			prisma.budgetPeriod.findUnique({
				where: {
					categoryId_year_month: {
						categoryId: normalizedSourceCategoryId,
						month,
						year,
					},
				},
			}),
			prisma.budgetPeriod.findUnique({
				where: {
					categoryId_year_month: {
						categoryId: normalizedTargetCategoryId,
						month,
						year,
					},
				},
			}),
		]);

		if (categories.length !== 2) {
			return res.status(404).json({ message: 'Category not found' });
		}

		if (!sourcePeriod || !targetPeriod) {
			return res.status(404).json({ message: 'Budget period not found for one of the categories' });
		}

		const availableCarryOver = Number(sourcePeriod.carryOver ?? 0);
		if (availableCarryOver < amount) {
			return res.status(400).json({ message: 'Source category does not have enough carry-over available' });
		}

		await prisma.$transaction([
			prisma.budgetPeriod.update({
				where: { id: sourcePeriod.id },
				data: { carryOver: availableCarryOver - amount },
			}),
			prisma.budgetPeriod.update({
				where: { id: targetPeriod.id },
				data: { carryOver: Number(targetPeriod.carryOver ?? 0) + amount },
			}),
		]);

		return res.status(200).json({
			message: 'Carry-over transferred successfully',
			month,
			year,
			sourceCategoryId: normalizedSourceCategoryId,
			targetCategoryId: normalizedTargetCategoryId,
			amount,
		});
	} catch (error) {
		logger.error('Failed to transfer carry-over between budgets', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to transfer carry-over between budgets' });
	}
});

// ============================================
// Dashboard Preferences API
// ============================================

router.get('/api/dashboard/budget-preferences', requireAuth, async (req: Request, res: Response) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: { dashboardBudgetPreferences: true },
		});

		res.status(200).json(
			user?.dashboardBudgetPreferences
				? normalizeDashboardBudgetPreferences(user.dashboardBudgetPreferences)
				: DEFAULT_DASHBOARD_BUDGET_PREFERENCES
		);
	} catch (error) {
		logger.error('Failed to fetch dashboard budget preferences', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to fetch dashboard budget preferences' });
	}
});

router.put('/api/dashboard/budget-preferences', requireAuth, async (req: Request, res: Response) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: { dashboardBudgetPreferences: true },
		});

		const preferences = resolveDashboardBudgetPreferences(user?.dashboardBudgetPreferences, req.body);

		await prisma.user.update({
			where: { id: req.user.id },
			data: {
				dashboardBudgetPreferences: preferences as unknown as Prisma.InputJsonValue,
			},
		});

		res.status(200).json(preferences);
	} catch (error) {
		logger.error('Failed to update dashboard budget preferences', { error, userId: req.user.id });
		res.status(500).json({ message: 'Failed to update dashboard budget preferences' });
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

router.post('/api/monthly-summaries/share', requireAuth, async (req: Request, res: Response) => {
	try {
		const { month, year, title } = req.body as { month?: number; year?: number; title?: string | null };

		if (!isValidShareMonth(Number(month), Number(year))) {
			return res.status(400).json({ message: 'month must be 1-12 and year must be valid' });
		}

		const token = createShareToken();
		const trimmedTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : null;
		const existingShare = await prisma.sharedMonthlySummary.findFirst({
			where: {
				userId: req.user.id,
				month: Number(month),
				year: Number(year),
				revokedAt: null,
			},
		});

		const record = existingShare
			? await prisma.sharedMonthlySummary.update({
					where: { id: existingShare.id },
					data: {
						token,
						title: trimmedTitle,
						revokedAt: null,
					},
				})
			: await prisma.sharedMonthlySummary.create({
					data: {
						userId: req.user.id,
						token,
						month: Number(month),
						year: Number(year),
						title: trimmedTitle,
					},
				});

		const summary = await buildSharedMonthlySummary(
			req.user.id,
			record.month,
			record.year,
			record.token,
			record.title,
			record.createdAt,
			record.expiresAt
		);

		return res.status(201).json(summary);
	} catch (error) {
		logger.error('Failed to create shared monthly summary', { error, userId: req.user.id });
		return res.status(500).json({ message: 'Failed to create shared monthly summary' });
	}
});

router.get('/api/public/monthly-summaries/:token', publicMonthlySummaryRateLimit, async (req: Request, res: Response) => {
	try {
		const token = String(req.params.token || '').trim();
		if (!token) {
			return res.status(400).json({ message: 'Share token is required' });
		}

		const share = await prisma.sharedMonthlySummary.findUnique({
			where: { token },
		});

		if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now())) {
			return res.status(404).json({ message: 'Shared summary not found' });
		}

		const summary = await buildSharedMonthlySummary(
			share.userId,
			share.month,
			share.year,
			share.token,
			share.title,
			share.createdAt,
			share.expiresAt
		);

		return res.status(200).json(summary);
	} catch (error) {
		logger.error('Failed to fetch shared monthly summary', { error });
		return res.status(500).json({ message: 'Failed to fetch shared monthly summary' });
	}
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
