import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
	checkActiveSecurityBlock,
	getRecordedSecurityEventsForTesting,
	getSecuritySummary,
	persistSecurityEvent,
	listSecurityBlocks,
	registerSuspiciousActivity,
	resetSecurityStateForTesting,
} from './security-events';
import { config } from '../config';
import { resetIpGeolocationCacheForTesting } from './ip-geolocation';
import type { SecurityFingerprint } from './security-fingerprint';


const originalGeoEnabled = config.SECURITY_GEO_ENRICHMENT_ENABLED;
const originalGeoEnvEnabled = process.env.SECURITY_GEO_ENRICHMENT_ENABLED;

const baseFingerprint: SecurityFingerprint = {
	ip: '198.51.100.200',
	ipHash: 'fingerprint-hash',
	authenticatedUserEmail: 'blocked-user@zentra.local',
	userAgent: 'Mozilla/5.0',
	attributionSource: 'x-forwarded-for',
	attributionTrusted: true,
};

describe('security-events', () => {
	beforeEach(() => {
		resetSecurityStateForTesting();
		resetIpGeolocationCacheForTesting();
	});

	afterEach(() => {
		config.SECURITY_GEO_ENRICHMENT_ENABLED = originalGeoEnabled;
		if (originalGeoEnvEnabled === undefined) {
			delete process.env.SECURITY_GEO_ENRICHMENT_ENABLED;
		} else {
			process.env.SECURITY_GEO_ENRICHMENT_ENABLED = originalGeoEnvEnabled;
		}
		jest.restoreAllMocks();
	});

	test('records suspicious activity and creates an automatic block at the configured threshold', async () => {
		await registerSuspiciousActivity({
			kind: 'blocked_path',
			action: 'blocked',
			method: 'GET',
			path: '/.env',
			statusCode: 403,
			matchedRule: 'blocked-path',
			fingerprint: baseFingerprint,
		});

		await registerSuspiciousActivity({
			kind: 'blocked_path',
			action: 'blocked',
			method: 'GET',
			path: '/appsettings.json',
			statusCode: 403,
			matchedRule: 'blocked-path',
			fingerprint: baseFingerprint,
		});

		const result = await registerSuspiciousActivity({
			kind: 'blocked_path',
			action: 'blocked',
			method: 'GET',
			path: '/.git/config',
			statusCode: 403,
			matchedRule: 'blocked-path',
			fingerprint: baseFingerprint,
		});

		expect(result.requestCount).toBe(3);
		expect(result.autoBlockCreated).toBe(true);

		const activeBlock = await checkActiveSecurityBlock(baseFingerprint.ip);
		expect(activeBlock.blocked).toBe(true);
		expect(activeBlock.blockId).not.toBeNull();

		const events = getRecordedSecurityEventsForTesting();
		expect(events.filter((event) => event.kind === 'blocked_path')).toHaveLength(3);
		expect(events.some((event) => event.kind === 'auto_block_created')).toBe(true);

		const blocks = await listSecurityBlocks({ active: true });
		expect(blocks.items[0]?.relatedAuthenticatedUserEmail).toBe('blocked-user@zentra.local');
	});

	test('excludes active block denials from top suspicious paths summary', async () => {
		await persistSecurityEvent({
			kind: 'active_block_denied',
			action: 'active_block_denied',
			method: 'GET',
			path: '/api/transactions',
			statusCode: 403,
			fingerprint: baseFingerprint,
		});

		await persistSecurityEvent({
			kind: 'not_found',
			action: 'not_found',
			method: 'GET',
			path: '/.cursor/mcp.json',
			statusCode: 404,
			fingerprint: baseFingerprint,
		});

		const summary = await getSecuritySummary();

		expect(summary.topPaths.some((item) => item.path === '/api/transactions')).toBe(false);
		expect(summary.topPaths.some((item) => item.path === '/.cursor/mcp.json')).toBe(true);
	});

	test('summarizes suspicious origins by country for the dashboard map', async () => {
		await persistSecurityEvent({
			kind: 'blocked_path',
			action: 'blocked',
			method: 'GET',
			path: '/.env',
			statusCode: 403,
			fingerprint: { ...baseFingerprint, country: 'us', city: 'Ashburn' },
		});

		await persistSecurityEvent({
			kind: 'not_found',
			action: 'not_found',
			method: 'GET',
			path: '/wp-admin',
			statusCode: 404,
			fingerprint: { ...baseFingerprint, ip: '198.51.100.201', country: 'US', city: 'Dallas' },
		});

		const summary = await getSecuritySummary();

		expect(summary.topCountries[0]).toEqual({
			country: 'US',
			count: 2,
			cities: ['Ashburn', 'Dallas'],
		});
	});

	test('falls back to IP geolocation for summary map when stored events have no country', async () => {
		process.env.SECURITY_GEO_ENRICHMENT_ENABLED = 'true';
		config.SECURITY_GEO_ENRICHMENT_ENABLED = true;
		jest.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, country_code: 'DE', region: 'Hesse', city: 'Frankfurt' }),
		} as Response);

		await persistSecurityEvent({
			kind: 'blocked_path',
			action: 'blocked',
			method: 'GET',
			path: '/.env',
			statusCode: 403,
			fingerprint: { ...baseFingerprint, ip: '8.8.8.8', ipHash: 'hash-8' },
		});

		const summary = await getSecuritySummary();

		expect(summary.topCountries[0]).toEqual({
			country: 'DE',
			count: 1,
			cities: ['Frankfurt'],
		});
	});
});
