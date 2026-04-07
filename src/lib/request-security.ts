import { createHash } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import * as nodemailer from 'nodemailer';
import logger from './logger';
import { redisClient } from './redis';

export const BLOCKED_PATH_PATTERNS = [
	/^\/\.env(?:$|[/.])/i,
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

export function extractClientIp(req: Pick<Request, 'ip' | 'headers' | 'socket'>): string {
	const rawIp = req.ip || req.socket.remoteAddress || 'unknown';

	return rawIp.replace(/^::ffff:/, '');
}

function hashIp(ip: string): string {
	return createHash('sha256').update(ip).digest('hex').slice(0, 12);
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
	os?: string;
	device?: string;
	referer?: string;
	origin?: string;
	host?: string;
	forwardedFor?: string;
	realIp?: string;
	forwardedProto?: string;
	forwardedHost?: string;
	acceptLanguage?: string;
	secChUa?: string;
	secChUaPlatform?: string;
	secChUaMobile?: string;
	country?: string;
	region?: string;
	city?: string;
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

	if (alert.os) {
		baseLines.push(`OS: ${alert.os}`);
	}

	if (alert.device) {
		baseLines.push(`Device: ${alert.device}`);
	}

	if (alert.acceptLanguage) {
		baseLines.push(`Accept-Language: ${alert.acceptLanguage}`);
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

	return baseLines.join('\n');
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	return Array.isArray(value) ? value[0] : value;
}

function detectBrowser(userAgent: string | undefined): string | undefined {
	if (!userAgent) {
		return undefined;
	}

	if (/edg\//i.test(userAgent)) {
		return 'Edge';
	}
	if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) {
		return 'Opera';
	}
	if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent) && !/opr\//i.test(userAgent)) {
		return 'Chrome';
	}
	if (/firefox\//i.test(userAgent)) {
		return 'Firefox';
	}
	if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) {
		return 'Safari';
	}
	if (/curl\//i.test(userAgent)) {
		return 'curl';
	}
	if (/python-requests/i.test(userAgent)) {
		return 'python-requests';
	}

	return undefined;
}

function detectOperatingSystem(userAgent: string | undefined, platformHint: string | undefined): string | undefined {
	const normalizedPlatformHint = platformHint?.replace(/"/g, '');
	if (normalizedPlatformHint) {
		return normalizedPlatformHint;
	}

	if (!userAgent) {
		return undefined;
	}

	if (/windows/i.test(userAgent)) {
		return 'Windows';
	}
	if (/android/i.test(userAgent)) {
		return 'Android';
	}
	if (/(iphone|ipad|ios)/i.test(userAgent)) {
		return 'iOS';
	}
	if (/mac os x|macintosh/i.test(userAgent)) {
		return 'macOS';
	}
	if (/linux/i.test(userAgent)) {
		return 'Linux';
	}

	return undefined;
}

function detectDevice(userAgent: string | undefined, mobileHint: string | undefined): string | undefined {
	if (mobileHint === '?1') {
		return 'Mobile';
	}
	if (mobileHint === '?0') {
		return 'Desktop';
	}
	if (!userAgent) {
		return undefined;
	}
	if (/(tablet|ipad)/i.test(userAgent)) {
		return 'Tablet';
	}
	if (/(mobile|iphone|android)/i.test(userAgent)) {
		return 'Mobile';
	}

	return 'Desktop';
}

export function collectSecurityRequestDetails(req: Request): SecurityRequestDetails {
	const userAgent = req.get('user-agent') ?? undefined;
	const secChUaPlatform = req.get('sec-ch-ua-platform') ?? undefined;
	const secChUaMobile = req.get('sec-ch-ua-mobile') ?? undefined;

	return {
		ip: extractClientIp(req),
		userAgent,
		browser: detectBrowser(userAgent),
		os: detectOperatingSystem(userAgent, secChUaPlatform),
		device: detectDevice(userAgent, secChUaMobile),
		referer: req.get('referer') ?? undefined,
		origin: req.get('origin') ?? undefined,
		host: req.get('host') ?? undefined,
		forwardedFor: normalizeHeaderValue(req.headers['x-forwarded-for']),
		realIp: req.get('x-real-ip') ?? undefined,
		forwardedProto: req.get('x-forwarded-proto') ?? undefined,
		forwardedHost: req.get('x-forwarded-host') ?? undefined,
		acceptLanguage: req.get('accept-language') ?? undefined,
		secChUa: req.get('sec-ch-ua') ?? undefined,
		secChUaPlatform,
		secChUaMobile,
		country: req.get('cf-ipcountry') ?? req.get('x-vercel-ip-country') ?? undefined,
		region: req.get('x-vercel-ip-country-region') ?? undefined,
		city: req.get('x-vercel-ip-city') ?? undefined,
	};
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
	const alertId = `${alert.kind}:${hashIp(alert.ip)}:${alert.path}`;

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
	if (!isBlockedPath(req.path)) {
		next();
		return;
	}

	logger.warn('Blocked suspicious request path', {
		path: req.path,
		ipHash: hashIp(extractClientIp(req)),
		method: req.method,
	});
	const requestDetails = collectSecurityRequestDetails(req);
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
			const { count: requestCount, resetAt } = await store.increment(key, options.windowMs);

			if (requestCount > options.maxRequests) {
				logger.warn('Rate limit exceeded', {
					ipHash: hashIp(ip),
					path: req.path,
					method: req.method,
					requestCount,
					windowMs: options.windowMs,
					maxRequests: options.maxRequests,
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
						ipHash: hashIp(ip),
					});
				});
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
