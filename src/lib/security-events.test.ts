import { beforeEach, describe, expect, test } from '@jest/globals';
import {
	checkActiveSecurityBlock,
	getRecordedSecurityEventsForTesting,
	listSecurityBlocks,
	registerSuspiciousActivity,
	resetSecurityStateForTesting,
} from './security-events';
import type { SecurityFingerprint } from './security-fingerprint';

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
});
