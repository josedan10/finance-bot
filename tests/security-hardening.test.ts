import request from 'supertest';
import { beforeEach, describe, expect, it } from '@jest/globals';
import app from '../app';
import { collectSecurityRequestDetails, resetRateLimitStoreForTesting } from '../src/lib/request-security';
import { getRecordedSecurityEventsForTesting, resetSecurityStateForTesting } from '../src/lib/security-events';

describe('Security hardening', () => {
	beforeEach(() => {
		resetRateLimitStoreForTesting();
		resetSecurityStateForTesting();
	});

	it('blocks suspicious scanner paths immediately', async () => {
		const response = await request(app).get('/.env').set('X-Forwarded-For', '198.51.100.10');

		expect(response.status).toBe(403);
		expect(response.text).toBe('Forbidden');
	});

	it('blocks appsettings probes immediately', async () => {
		const response = await request(app).get('/appsettings.json').set('X-Forwarded-For', '198.51.100.11');

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

	it('creates in-memory security events and auto-blocks after repeated suspicious probes', async () => {
		const ip = '198.51.100.77';

		await request(app).get('/.env').set('X-Forwarded-For', ip);
		await request(app).get('/appsettings.json').set('X-Forwarded-For', ip);
		await request(app).get('/.git/config').set('X-Forwarded-For', ip);

		const blockedResponse = await request(app).get('/').set('X-Forwarded-For', ip);

		expect(blockedResponse.status).toBe(403);
		expect(blockedResponse.text).toBe('Forbidden');

		const events = getRecordedSecurityEventsForTesting();
		expect(events.some((event) => event.kind === 'blocked_path' && event.path === '/appsettings.json')).toBe(true);
		expect(events.some((event) => event.kind === 'auto_block_created')).toBe(true);
		expect(events.some((event) => event.kind === 'active_block_denied' && event.path === '/')).toBe(true);
	});

	it('collects enriched attacker context from headers', () => {
		const details = collectSecurityRequestDetails({
			ip: '::ffff:203.0.113.99',
			headers: {
				'x-forwarded-for': '198.51.100.50, 10.0.0.1',
			},
			socket: { remoteAddress: '::ffff:192.0.2.5' },
			get(header: string) {
				const values: Record<string, string> = {
					'user-agent':
						'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
					'sec-ch-ua-platform': '"Android"',
					'sec-ch-ua-mobile': '?1',
					'sec-ch-ua': '"Chromium";v="124", "Not.A/Brand";v="8"',
					'accept-language': 'en-US,en;q=0.9',
					referer: 'https://evil.example/login',
					origin: 'https://evil.example',
					host: 'api.zentra-app.pro',
					'x-real-ip': '198.51.100.50',
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'api.zentra-app.pro',
					'cf-ipcountry': 'US',
					'x-vercel-ip-country-region': 'CA',
					'x-vercel-ip-city': 'San Francisco',
				};

				return values[header.toLowerCase()];
			},
		} as never);

		expect(details.ip).toBe('203.0.113.99');
		expect(details.browser).toBe('Chrome');
		expect(details.browserVersion).toBe('124.0.0.0');
		expect(details.os).toBe('Android');
		expect(details.osVersion).toBe('14');
		expect(details.device).toBe('Mobile');
		expect(details.country).toBe('US');
		expect(details.region).toBe('CA');
		expect(details.city).toBe('San Francisco');
		expect(details.referer).toBe('https://evil.example/login');
		expect(details.forwardedFor).toBe('198.51.100.50, 10.0.0.1');
		expect(details.forwardedPort).toBeUndefined();
		expect(details.attributionSource).toBe('x-forwarded-for');
		expect(details.attributionTrusted).toBe(true);
	});
});
