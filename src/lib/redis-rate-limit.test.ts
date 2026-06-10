import type { NextFunction, Request, Response } from 'express';
import { createRedisRateLimitMiddleware } from './redis-rate-limit';
import { redisClient } from './redis';

jest.mock('./redis', () => ({
	redisClient: {
		getClient: jest.fn(),
	},
}));

describe('createRedisRateLimitMiddleware', () => {
	const getClientMock = redisClient.getClient as jest.MockedFunction<typeof redisClient.getClient>;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should allow requests within the limit', async () => {
		const incr = jest.fn().mockResolvedValue(1);
		const expire = jest.fn().mockResolvedValue(1);
		getClientMock.mockResolvedValue({ incr, expire } as never);

		const middleware = createRedisRateLimitMiddleware({
			windowMs: 60_000,
			maxRequests: 2,
			keyPrefix: 'rate_limit:test',
			getKey: (req) => `${req.ip}:${req.params.token}`,
		});

		const next = jest.fn() as NextFunction;
		const req = { ip: '127.0.0.1', params: { token: 'abc' } } as unknown as Request;
		const status = jest.fn();
		const json = jest.fn();
		const setHeader = jest.fn();
		const res = { status, json, setHeader } as unknown as Response;

		await middleware(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(status).not.toHaveBeenCalled();
		expect(incr).toHaveBeenCalled();
		expect(expire).toHaveBeenCalled();
	});

	it('should reject requests that exceed the limit', async () => {
		const incr = jest.fn().mockResolvedValue(3);
		const expire = jest.fn();
		getClientMock.mockResolvedValue({ incr, expire } as never);

		const middleware = createRedisRateLimitMiddleware({
			windowMs: 60_000,
			maxRequests: 2,
			keyPrefix: 'rate_limit:test',
			getKey: (req) => `${req.ip}:${req.params.token}`,
		});

		const next = jest.fn() as NextFunction;
		const req = { ip: '127.0.0.1', params: { token: 'abc' } } as unknown as Request;
		const status = jest.fn().mockReturnThis();
		const json = jest.fn();
		const setHeader = jest.fn();
		const res = { status, json, setHeader } as unknown as Response;

		await middleware(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(429);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Too many requests' }));
		expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
	});

	it('should return 503 when redis is unavailable', async () => {
		getClientMock.mockRejectedValue(new Error('redis down'));

		const middleware = createRedisRateLimitMiddleware({
			windowMs: 60_000,
			maxRequests: 2,
			keyPrefix: 'rate_limit:test',
		});

		const next = jest.fn() as NextFunction;
		const req = { ip: '127.0.0.1', params: { token: 'abc' } } as unknown as Request;
		const status = jest.fn().mockReturnThis();
		const json = jest.fn();
		const res = { status, json } as unknown as Response;

		await middleware(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(503);
		expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Rate limiting unavailable' }));
	});
});
