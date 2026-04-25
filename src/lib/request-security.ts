import type { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import * as nodemailer from 'nodemailer';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import logger from './logger';
import { redisClient } from './redis';
import {
	checkActiveSecurityBlock,
	persistSecurityEvent,
	registerSuspiciousActivity,
} from './security-events';
import { matchActiveSecurityPathBlock } from './security-path-blocks';
import { collectSecurityFingerprint, extractClientIp, hashSecurityIp, type SecurityFingerprint } from './security-fingerprint';
import { firebaseAdmin } from './firebase';

export const BLOCKED_PATH_PATTERNS = [
	/^\/\.env(?:$|[/.])/i,
	/^\/appsettings(?:\.[^/]+)*\.json$/i,
	/^\/wp-login\.php$/i,
	/^\/wp-admin(?:\/|$)/i,
	/^\/xmlrpc\.php$/i,
	/^\/phpmyadmin(?:\/|$)/i,
	/^\/\.git(?:\/|$)/i,
	/^\/server-status(?:\/|$)/i,
];

export function isBlockedPath(pathname: string): boolean {
	return BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function applySecurityHeaders(res: Response): void {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-Frame-Options', 'DENY');
	res.setHeader('Referrer-Policy', 'same-origin');
	res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
	res.setHeader(
		'Content-Security-Policy',
		"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'"
	);
}

type SecurityAlertKind = 'blocked_path' | 'rate_limit';

type SecurityAlert = {
	kind: SecurityAlertKind;
	ip: string;
	path: string;
	method: string;
	userAgent?: string;
	browser?: string;
	browserVersion?: string;
	os?: string;
	osVersion?: string;
	device?: string;
	deviceBrand?: string;
	deviceModel?: string;
	referer?: string;
	origin?: string;
	host?: string;
	forwardedFor?: string;
	realIp?: string;
	forwardedProto?: string;
	forwardedHost?: string;
	forwardedPort?: string;
	forwardedServer?: string;
	acceptLanguage?: string;
	timezone?: string;
	secChUa?: string;
	secChUaPlatform?: string;
	secChUaMobile?: string;
	country?: string;
	region?: string;
	city?: string;
	attributionSource?: string;
	attributionTrusted?: boolean;
	requestCount?: number;
	windowMs?: number;
};

type SecurityRequestDetails = Omit<SecurityAlert, 'kind' | 'path' | 'method' | 'requestCount' | 'windowMs'>;

function extractEmailDomain(email: string | undefined): string | null {
	if (!email || !email.includes('@')) {
		return null;
	}

	return email.split('@')[1]?.trim() || null;
}

function resolveMailgunMessagesUrl(baseUrl: string, sender: string | undefined): string | null {
	if (!baseUrl) {
		return null;
	}

	if (baseUrl.includes('/messages')) {
		return baseUrl;
	}

	const domain = extractEmailDomain(sender);
	if (!domain) {
		return null;
	}

	return `${baseUrl.replace(/\/+$/, '')}/v3/${domain}/messages`;
}

function formatSecurityAlertMessage(alert: SecurityAlert): string {
	const baseLines = [
		'🚨 Suspicious request detected',
		`Type: ${alert.kind === 'blocked_path' ? 'Blocked path access' : 'Rate limit exceeded'}`,
		`Method: ${alert.method}`,
		`Path: ${alert.path}`,
		`IP: ${alert.ip}`,
	];

	if (alert.requestCount && alert.windowMs) {
		baseLines.push(`Burst: ${alert.requestCount} requests in ${alert.windowMs}ms`);
	}

	if (alert.userAgent) {
		baseLines.push(`User-Agent: ${alert.userAgent}`);
	}

	if (alert.browser) {
		baseLines.push(`Browser: ${alert.browser}`);
	}
	if (alert.browserVersion) {
		baseLines.push(`Browser Version: ${alert.browserVersion}`);
	}

	if (alert.os) {
		baseLines.push(`OS: ${alert.os}`);
	}
	if (alert.osVersion) {
		baseLines.push(`OS Version: ${alert.osVersion}`);
	}

	if (alert.device) {
		baseLines.push(`Device: ${alert.device}`);
	}
	if (alert.deviceBrand) {
		baseLines.push(`Device Brand: ${alert.deviceBrand}`);
	}
	if (alert.deviceModel) {
		baseLines.push(`Device Model: ${alert.deviceModel}`);
	}

	if (alert.acceptLanguage) {
		baseLines.push(`Accept-Language: ${alert.acceptLanguage}`);
	}
	if (alert.timezone) {
		baseLines.push(`Timezone: ${alert.timezone}`);
	}

	if (alert.referer) {
		baseLines.push(`Referer: ${alert.referer}`);
	}

	if (alert.origin) {
		baseLines.push(`Origin: ${alert.origin}`);
	}

	if (alert.host) {
		baseLines.push(`Host: ${alert.host}`);
	}

	if (alert.forwardedFor) {
		baseLines.push(`X-Forwarded-For: ${alert.forwardedFor}`);
	}

	if (alert.realIp) {
		baseLines.push(`X-Real-IP: ${alert.realIp}`);
	}

	if (alert.forwardedProto) {
		baseLines.push(`X-Forwarded-Proto: ${alert.forwardedProto}`);
	}

	if (alert.forwardedHost) {
		baseLines.push(`X-Forwarded-Host: ${alert.forwardedHost}`);
	}
	if (alert.forwardedPort) {
		baseLines.push(`X-Forwarded-Port: ${alert.forwardedPort}`);
	}
	if (alert.forwardedServer) {
		baseLines.push(`X-Forwarded-Server: ${alert.forwardedServer}`);
	}

	if (alert.secChUa) {
		baseLines.push(`Sec-CH-UA: ${alert.secChUa}`);
	}

	if (alert.secChUaPlatform) {
		baseLines.push(`Sec-CH-UA-Platform: ${alert.secChUaPlatform}`);
	}

	if (alert.secChUaMobile) {
		baseLines.push(`Sec-CH-UA-Mobile: ${alert.secChUaMobile}`);
	}

	const locationParts = [alert.city, alert.region, alert.country].filter(Boolean);
	if (locationParts.length > 0) {
		baseLines.push(`Location: ${locationParts.join(', ')}`);
	}
	if (alert.attributionSource) {
		baseLines.push(`Attribution Source: ${alert.attributionSource}`);
	}
	if (typeof alert.attributionTrusted === 'boolean') {
		baseLines.push(`Trusted Attribution: ${alert.attributionTrusted ? 'yes' : 'no'}`);
	}

	return baseLines.join('\n');
}

export function collectSecurityRequestDetails(req: Request): SecurityRequestDetails {
	const fingerprint = collectSecurityFingerprint(req);

	return {
		ip: fingerprint.ip,
		userAgent: fingerprint.userAgent,
		browser: fingerprint.browserName,
		browserVersion: fingerprint.browserVersion,
		os: fingerprint.osName,
		osVersion: fingerprint.osVersion,
		device: fingerprint.deviceType,
		deviceBrand: fingerprint.deviceBrand,
		deviceModel: fingerprint.deviceModel,
		referer: fingerprint.referer,
		origin: fingerprint.origin,
		host: fingerprint.host,
		forwardedFor: fingerprint.forwardedFor,
		realIp: fingerprint.realIp,
		forwardedProto: fingerprint.forwardedProto,
		forwardedHost: fingerprint.forwardedHost,
		forwardedPort: fingerprint.forwardedPort,
		forwardedServer: fingerprint.forwardedServer,
		acceptLanguage: fingerprint.acceptLanguage,
		timezone: fingerprint.timezone,
		secChUa: fingerprint.secChUa,
		secChUaPlatform: fingerprint.secChUaPlatform,
		secChUaMobile: fingerprint.secChUaMobile,
		country: fingerprint.country,
		region: fingerprint.region,
		city: fingerprint.city,
		attributionSource: fingerprint.attributionSource,
		attributionTrusted: fingerprint.attributionTrusted,
	};
}

function getBearerTokenFromRequest(req: Request): string | null {
	const authorizationHeader = req.get('authorization');
	if (!authorizationHeader) {
		return null;
	}

	const [scheme, token] = authorizationHeader.split(' ');
	if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
		return null;
	}

	return token.trim();
}

export async function collectSecurityFingerprintWithAuthContext(
	req: Request,
	baseFingerprint?: SecurityFingerprint
): Promise<SecurityFingerprint> {
	const fingerprint = baseFingerprint ?? collectSecurityFingerprint(req);
	const bearerToken = getBearerTokenFromRequest(req);
	if (!bearerToken) {
		return fingerprint;
	}

	try {
		const decoded = await firebaseAdmin.auth().verifyIdToken(bearerToken);
		const matchedUser = await prisma.user.findUnique({
			where: { firebaseId: decoded.uid },
			select: { id: true, email: true },
		});

		return {
			...fingerprint,
			authenticatedUserId: matchedUser?.id,
			authenticatedUserEmail: matchedUser?.email ?? decoded.email,
			authenticatedFirebaseId: decoded.uid,
		};
	} catch {
		return fingerprint;
	}
}

async function handleSuspiciousActivity(
	req: Request,
	fingerprint: SecurityFingerprint,
	input: {
		kind: 'blocked_path' | 'rate_limit';
		action: 'blocked' | 'rate_limited';
		statusCode: number;
		matchedRule: string;
		requestCount?: number;
		windowMs?: number;
	}
): Promise<void> {
	await registerSuspiciousActivity({
		kind: input.kind,
		action: input.action,
		method: req.method,
		path: req.path,
		statusCode: input.statusCode,
		matchedRule: input.matchedRule,
		requestCount: input.requestCount,
		windowMs: input.windowMs,
		fingerprint,
	});
}

async function sendSecurityAlert(alert: SecurityAlert): Promise<void> {
	if (process.env.NODE_ENV === 'test') {
		return;
	}

	const recipient = process.env.SECURITY_ALERT_EMAIL_TO || process.env.MAILGUN_SANDBOX_EMAIL || process.env.SMTP_USER || '';
	if (!recipient) {
		return;
	}

	const dedupeTtlSeconds = Number(process.env.SECURITY_ALERT_TTL_SECONDS || 900);
	const alertKey = `security-alert:${alert.kind}:${alert.ip}:${alert.path}`;
	const alertId = `${alert.kind}:${hashSecurityIp(alert.ip)}:${alert.path}`;

	try {
		const dedupeResult = await redisClient.set(alertKey, '1', {
			EX: dedupeTtlSeconds,
			NX: true,
		});

		if (dedupeResult === 'OK') {
			// continue
		} else if (dedupeResult == null) {
			logger.warn('Security alert dedupe unavailable; sending alert', {
				alertId,
				error: 'Redis set returned no result',
			});
		} else {
			return;
		}
	} catch (error) {
		logger.warn('Security alert dedupe failed open', {
			alertId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	try {
		const subject = `🚨 Zentra security alert: ${alert.path}`;
		const message = formatSecurityAlertMessage(alert);
		const mailgunApiKey = process.env.MAILGUN_API_KEY || '';
		const mailgunApiUrl = process.env.MAILGUN_API_URL || '';
		const sender =
			process.env.SECURITY_ALERT_EMAIL_FROM ||
			process.env.EMAIL_FROM ||
			process.env.MAILGUN_SANDBOX_EMAIL ||
			process.env.SMTP_USER;

		const resolvedMailgunUrl = resolveMailgunMessagesUrl(mailgunApiUrl, sender);

		if (mailgunApiKey && resolvedMailgunUrl && sender) {
			const payload = new URLSearchParams();
			payload.set('from', sender);
			payload.set('to', recipient);
			payload.set('subject', subject);
			payload.set('text', message);

			await axios.post(resolvedMailgunUrl, payload.toString(), {
				auth: {
					username: 'api',
					password: mailgunApiKey,
				},
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			});
			return;
		}

		const transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST || 'smtp.gmail.com',
			port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
			secure: process.env.SMTP_SECURE === 'true',
			auth: {
				user: process.env.SMTP_USER,
				pass: process.env.SMTP_PASS,
			},
		});

		await transporter.sendMail({
			from: sender,
			to: recipient,
			subject,
			text: message,
		});
	} catch (error) {
		logger.error('Failed to send security alert', {
			alertId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
	applySecurityHeaders(res);
	next();
}

export function blockSuspiciousPathsMiddleware(req: Request, res: Response, next: NextFunction): void {
	const blockRequest = (matchedRule: string): void => {
		logger.warn('Blocked suspicious request path', {
			path: req.path,
			ipHash: hashSecurityIp(extractClientIp(req)),
			method: req.method,
			matchedRule,
			});
			const requestDetails = collectSecurityRequestDetails(req);
			const baseFingerprint = collectSecurityFingerprint(req);
			collectSecurityFingerprintWithAuthContext(req, baseFingerprint)
				.then((fingerprint) => handleSuspiciousActivity(req, fingerprint, {
					kind: 'blocked_path',
					action: 'blocked',
					statusCode: 403,
				matchedRule,
			}))
			.catch((error) => {
				logger.error('Failed to persist blocked-path security activity', {
					error: error instanceof Error ? error.message : String(error),
					path: req.path,
					ipHash: baseFingerprint.ipHash,
				});
			});
		sendSecurityAlert({
			kind: 'blocked_path',
			path: req.path,
			method: req.method,
			...requestDetails,
		}).catch((error) => {
			logger.error('Failed to schedule blocked-path security alert', {
				error: error instanceof Error ? error.message : String(error),
				path: req.path,
			});
		});
		res.status(403).type('text/plain').send('Forbidden');
	};

	if (isBlockedPath(req.path)) {
		blockRequest('blocked-path-pattern');
		return;
	}

	matchActiveSecurityPathBlock(req.path)
		.then((match) => {
			if (!match.blocked) {
				next();
				return;
			}

			blockRequest(`manual-path-block:${match.pathBlockId}`);
		})
		.catch((error) => {
			logger.warn('Manual blocked path lookup failed open', {
				error: error instanceof Error ? error.message : String(error),
				path: req.path,
			});
			next();
		});
}

export function activeSecurityBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
	if (req.method === 'OPTIONS' || req.path === '/health') {
		next();
		return;
	}

	const baseFingerprint = collectSecurityFingerprint(req);
	checkActiveSecurityBlock(baseFingerprint.ip)
		.then(async ({ blocked, blockId }) => {
			if (!blocked) {
				next();
				return;
			}

			logger.warn('Blocked request from active security block', {
				path: req.path,
				ipHash: baseFingerprint.ipHash,
				method: req.method,
				blockId,
			});

			const fingerprint = await collectSecurityFingerprintWithAuthContext(req, baseFingerprint);
			await persistSecurityEvent({
				kind: 'active_block_denied',
				action: 'active_block_denied',
				method: req.method,
				path: req.path,
				statusCode: 403,
				matchedRule: 'active-security-block',
				blockId,
				fingerprint,
			});
			res.status(403).type('text/plain').send('Forbidden');
		})
		.catch((error) => {
			logger.warn('Active security block check failed open', {
				error: error instanceof Error ? error.message : String(error),
				path: req.path,
			});
			next();
		});
}

export interface RateLimitStore {
	increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export class MemoryRateLimitStore implements RateLimitStore {
	private readonly entries = new Map<string, { count: number; expiresAt: number }>();
	private readonly cleanupInterval: NodeJS.Timeout;

	constructor(private readonly cleanupIntervalMs: number = 60_000) {
		this.cleanupInterval = setInterval(() => {
			this.cleanupExpired();
		}, this.cleanupIntervalMs);
		this.cleanupInterval.unref();
	}

	private cleanupExpired(now: number = Date.now()): void {
		for (const [key, value] of this.entries.entries()) {
			if (value.expiresAt <= now) {
				this.entries.delete(key);
			}
		}
	}

	clear(): void {
		this.entries.clear();
	}

	stop(): void {
		clearInterval(this.cleanupInterval);
	}

	async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
		const now = Date.now();
		this.cleanupExpired(now);
		const existing = this.entries.get(key);
		if (!existing || existing.expiresAt <= now) {
			const expiresAt = now + windowMs;
			this.entries.set(key, { count: 1, expiresAt });
			return { count: 1, resetAt: expiresAt };
		}

		existing.count += 1;
		return { count: existing.count, resetAt: existing.expiresAt };
	}
}

export class RedisRateLimitStore implements RateLimitStore {
	private static readonly INCR_WITH_TTL_SCRIPT = `
		local current = redis.call('INCR', KEYS[1])
		if current == 1 then
			redis.call('PEXPIRE', KEYS[1], ARGV[1])
		end
		local ttl = redis.call('PTTL', KEYS[1])
		return { current, ttl }
	`;

	async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
		const client = await redisClient.getClient();
		const result = (await client.eval(RedisRateLimitStore.INCR_WITH_TTL_SCRIPT, {
			keys: [key],
			arguments: [String(windowMs)],
		})) as [number | string, number | string];
		const count = Number(result[0]);
		const ttlMs = Math.max(0, Number(result[1]));

		return {
			count,
			resetAt: Date.now() + ttlMs,
		};
	}
}

const memoryRateLimitStore = new MemoryRateLimitStore();

export function createRateLimitStore(): RateLimitStore {
	if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
		return new RedisRateLimitStore();
	}

	return memoryRateLimitStore;
}

export function resetRateLimitStoreForTesting(): void {
	if (process.env.NODE_ENV === 'test') {
		memoryRateLimitStore.clear();
	}
}

type RateLimitOptions = {
	windowMs: number;
	maxRequests: number;
	store?: RateLimitStore;
	resolveMaxRequests?: (req: Request, defaults: { maxRequests: number; windowMs: number }) => number;
	shouldSkipSuspiciousTracking?: (req: Request) => boolean;
};

export function createRateLimitMiddleware(options: RateLimitOptions) {
	const store = options.store ?? createRateLimitStore();

	return async (req: Request, res: Response, next: NextFunction) => {
		if (req.method === 'OPTIONS' || req.path === '/health') {
			next();
			return;
		}

		try {
			const requestDetails = collectSecurityRequestDetails(req);
			const ip = requestDetails.ip;
			const key = `api-rate-limit:${ip}`;
			const resolvedMaxRequestsRaw = options.resolveMaxRequests?.(req, {
				maxRequests: options.maxRequests,
				windowMs: options.windowMs,
			});
			const effectiveMaxRequests = Number.isFinite(resolvedMaxRequestsRaw)
				? Math.max(1, Math.floor(resolvedMaxRequestsRaw as number))
				: options.maxRequests;
			const shouldSkipSuspiciousTracking = options.shouldSkipSuspiciousTracking?.(req) ?? false;
			const { count: requestCount, resetAt } = await store.increment(key, options.windowMs);

			if (requestCount > effectiveMaxRequests) {
				logger.warn('Rate limit exceeded', {
					ipHash: hashSecurityIp(ip),
					path: req.path,
					method: req.method,
					requestCount,
					windowMs: options.windowMs,
					maxRequests: effectiveMaxRequests,
				});
				sendSecurityAlert({
					kind: 'rate_limit',
					path: req.path,
					method: req.method,
					...requestDetails,
					requestCount,
					windowMs: options.windowMs,
				}).catch((error) => {
					logger.error('Failed to schedule rate-limit security alert', {
						error: error instanceof Error ? error.message : String(error),
						path: req.path,
						ipHash: hashSecurityIp(ip),
					});
				});
				if (!shouldSkipSuspiciousTracking) {
					await handleSuspiciousActivity(
						req,
						await collectSecurityFingerprintWithAuthContext(req, collectSecurityFingerprint(req)),
						{
							kind: 'rate_limit',
							action: 'rate_limited',
							statusCode: 429,
							matchedRule: 'api-rate-limit',
							requestCount,
							windowMs: options.windowMs,
						}
					);
				}
				const remainingMs = Math.max(0, resetAt - Date.now());
				res.setHeader('Retry-After', Math.max(1, Math.ceil(remainingMs / 1000)));
				res.status(429).json({
					status: 'fail',
					message: 'Too many requests, please try again later.',
				});
				return;
			}
		} catch (error) {
			logger.warn('Rate limiting failed open', {
				error: error instanceof Error ? error.message : String(error),
				path: req.path,
			});
		}

		next();
	};
}
