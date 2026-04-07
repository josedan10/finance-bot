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
	const forwardedFor = req.headers['x-forwarded-for'];
	const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
	const rawIp = headerValue?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';

	return rawIp.replace(/^::ffff:/, '');
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
	requestCount?: number;
	windowMs?: number;
};

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

	return baseLines.join('\n');
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

	try {
		const dedupeResult = await redisClient.set(alertKey, '1', {
			EX: dedupeTtlSeconds,
			NX: true,
		});

		if (dedupeResult !== 'OK') {
			return;
		}
	} catch (error) {
		logger.warn('Security alert dedupe failed open', {
			error: error instanceof Error ? error.message : String(error),
			alertKey,
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
			error: error instanceof Error ? error.message : String(error),
			alert,
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
		ip: extractClientIp(req),
		method: req.method,
	});
	sendSecurityAlert({
		kind: 'blocked_path',
		path: req.path,
		ip: extractClientIp(req),
		method: req.method,
		userAgent: req.get('user-agent') ?? undefined,
	}).catch((error) => {
		logger.error('Failed to schedule blocked-path security alert', {
			error: error instanceof Error ? error.message : String(error),
			path: req.path,
		});
	});
	res.status(403).type('text/plain').send('Forbidden');
}

export interface RateLimitStore {
	increment(key: string, windowMs: number): Promise<number>;
}

export class MemoryRateLimitStore implements RateLimitStore {
	private readonly entries = new Map<string, { count: number; expiresAt: number }>();

	async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now();
		const existing = this.entries.get(key);
		if (!existing || existing.expiresAt <= now) {
			this.entries.set(key, { count: 1, expiresAt: now + windowMs });
			return 1;
		}

		existing.count += 1;
		return existing.count;
	}
}

export class RedisRateLimitStore implements RateLimitStore {
	async increment(key: string, windowMs: number): Promise<number> {
		const client = await redisClient.getClient();
		const count = await client.incr(key);

		if (count === 1) {
			await client.pExpire(key, windowMs);
		}

		return count;
	}
}

export function createRateLimitStore(): RateLimitStore {
	if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
		return new RedisRateLimitStore();
	}

	return new MemoryRateLimitStore();
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
			const ip = extractClientIp(req);
			const key = `api-rate-limit:${ip}`;
			const requestCount = await store.increment(key, options.windowMs);

			if (requestCount > options.maxRequests) {
				logger.warn('Rate limit exceeded', {
					ip,
					path: req.path,
					method: req.method,
					requestCount,
					windowMs: options.windowMs,
					maxRequests: options.maxRequests,
				});
				sendSecurityAlert({
					kind: 'rate_limit',
					ip,
					path: req.path,
					method: req.method,
					userAgent: req.get('user-agent') ?? undefined,
					requestCount,
					windowMs: options.windowMs,
				}).catch((error) => {
					logger.error('Failed to schedule rate-limit security alert', {
						error: error instanceof Error ? error.message : String(error),
						path: req.path,
						ip,
					});
				});
				res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
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
