import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
	checkActiveSecurityBlock,
	persistSecurityEvent,
	resetSecurityStateForTesting,
} from '../src/lib/security-events';

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: any, _res: any, next: any) => {
		req.user = {
			id: 1,
			email: 'dev@example.com',
			role: req.headers['x-test-role'] || 'user',
			firebaseId: 'test-firebase-id',
		};
		next();
	},
	requireRole: (roles: string[]) => (req: any, res: any, next: any) => {
		if (roles.includes(req.user?.role)) {
			next();
			return;
		}

		res.status(403).json({ message: 'Forbidden' });
	},
}));

import app from '../app';

function buildFingerprint(ip: string) {
	return {
		ip,
		ipHash: `hash-${ip}`,
		userAgent: 'Mozilla/5.0',
		attributionSource: 'x-forwarded-for',
		attributionTrusted: true,
	} as const;
}

describe('Security monitoring routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetSecurityStateForTesting();
	});

	it('returns an empty summary for an authorized dev when no security activity exists', async () => {
		const response = await request(app)
			.get('/api/security/summary')
			.set('x-test-role', 'dev');

		expect(response.status).toBe(200);
		expect(response.body.totals.events).toBe(0);
		expect(response.body.totals.uniqueOrigins).toBe(0);
		expect(response.body.totals.activeBlocks).toBe(0);
	});

	it('rejects non-privileged users from the security monitoring API', async () => {
		const response = await request(app)
			.get('/api/security/events')
			.set('x-test-role', 'user');

		expect(response.status).toBe(403);
		expect(response.body).toEqual({ message: 'Forbidden' });
	});

	it('returns filtered security events for an authorized dev', async () => {
		await persistSecurityEvent({
			kind: 'blocked_path',
			action: 'blocked',
			method: 'GET',
			path: '/appsettings.json',
			statusCode: 403,
			matchedRule: 'blocked-path',
			fingerprint: buildFingerprint('198.51.100.41'),
		});
		await persistSecurityEvent({
			kind: 'rate_limit',
			action: 'rate_limited',
			method: 'GET',
			path: '/',
			statusCode: 429,
			matchedRule: 'api-rate-limit',
			fingerprint: buildFingerprint('198.51.100.42'),
		});

		const response = await request(app)
			.get('/api/security/events')
			.query({ action: 'blocked', path: '/appsettings', page: 1, pageSize: 10 })
			.set('x-test-role', 'dev');

		expect(response.status).toBe(200);
		expect(response.body.total).toBe(1);
		expect(response.body.items).toHaveLength(1);
		expect(response.body.items[0]).toMatchObject({
			kind: 'blocked_path',
			action: 'blocked',
			path: '/appsettings.json',
			ip: '198.51.100.41',
		});
	});

	it('supports manual block creation, listing, and removal for authorized dev users', async () => {
		const createResponse = await request(app)
			.post('/api/security/blocks')
			.set('x-test-role', 'dev')
			.send({
				ip: '198.51.100.90',
				reason: 'Repeated suspicious probes',
				expiresInMinutes: 30,
			});

		expect(createResponse.status).toBe(201);
		expect(createResponse.body).toMatchObject({
			ip: '198.51.100.90',
			source: 'manual',
			reason: 'Repeated suspicious probes',
			active: true,
		});

		const activeBlockState = await checkActiveSecurityBlock('198.51.100.90');
		expect(activeBlockState.blocked).toBe(true);

		const listResponse = await request(app)
			.get('/api/security/blocks')
			.query({ active: true })
			.set('x-test-role', 'dev');

		expect(listResponse.status).toBe(200);
		expect(listResponse.body.total).toBe(1);
		expect(listResponse.body.items[0]).toMatchObject({
			id: createResponse.body.id,
			ip: '198.51.100.90',
			source: 'manual',
			active: true,
		});

		const deleteResponse = await request(app)
			.delete(`/api/security/blocks/${createResponse.body.id}`)
			.set('x-test-role', 'dev');

		expect(deleteResponse.status).toBe(200);
		expect(deleteResponse.body).toMatchObject({
			id: createResponse.body.id,
			active: false,
			removedBy: 1,
		});

		const blockStateAfterDelete = await checkActiveSecurityBlock('198.51.100.90');
		expect(blockStateAfterDelete.blocked).toBe(false);
	});
});
