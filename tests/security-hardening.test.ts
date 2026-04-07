import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import app from '../app';

describe('Security hardening', () => {
	it('blocks suspicious scanner paths immediately', async () => {
		const response = await request(app).get('/.env').set('X-Forwarded-For', '198.51.100.10');

		expect(response.status).toBe(403);
		expect(response.text).toBe('Forbidden');
	});

	it('returns core security headers on healthy responses', async () => {
		const response = await request(app).get('/health');

		expect(response.status).toBe(200);
		expect(response.headers['content-security-policy']).toContain("default-src 'self'");
		expect(response.headers['x-frame-options']).toBe('DENY');
		expect(response.headers['x-content-type-options']).toBe('nosniff');
		expect(response.headers['referrer-policy']).toBe('same-origin');
	});

	it('rate limits burst traffic from the same IP', async () => {
		const ip = '203.0.113.50';
		let finalResponse = await request(app).get('/').set('X-Forwarded-For', ip);

		for (let attempt = 0; attempt < 30; attempt += 1) {
			finalResponse = await request(app).get('/').set('X-Forwarded-For', ip);
		}

		expect(finalResponse.status).toBe(429);
		expect(finalResponse.body).toEqual({
			status: 'fail',
			message: 'Too many requests, please try again later.',
		});
		expect(finalResponse.headers['retry-after']).toBe('1');
	});
});
