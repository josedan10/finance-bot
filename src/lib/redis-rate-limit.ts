import { NextFunction, Request, Response } from 'express';
import logger from './logger';
import { redisClient } from './redis';

export interface RedisRateLimitOptions {
	windowMs: number;
	maxRequests: number;
	keyPrefix: string;
	getKey?: (req: Request) => string;
}

function normalizeRateLimitKey(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '_');
}

export function createRedisRateLimitMiddleware(options: RedisRateLimitOptions) {
	const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));

	return async function redisRateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
		const requestKey = options.getKey ? options.getKey(req) : req.ip ?? 'unknown';
		const bucket = Math.floor(Date.now() / options.windowMs);
		const redisKey = `${options.keyPrefix}:${normalizeRateLimitKey(requestKey)}:${bucket}`;

		try {
			const client = await redisClient.getClient();
			const currentRequests = await client.incr(redisKey);

			if (currentRequests === 1) {
				await client.expire(redisKey, windowSeconds);
			}

			if (currentRequests > options.maxRequests) {
				res.setHeader('Retry-After', String(windowSeconds));
				res.status(429).json({ message: 'Too many requests' });
				return;
			}

			next();
		} catch (error) {
			logger.error('Redis rate limiter failed', {
				key: redisKey,
				error: error instanceof Error ? error.message : String(error),
			});
			res.status(503).json({ message: 'Rate limiting unavailable' });
		}
	};
}
