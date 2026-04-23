import { beforeEach, describe, expect, test } from '@jest/globals';
import {
	createSecurityPathBlock,
	listSecurityPathBlocks,
	matchActiveSecurityPathBlock,
	removeSecurityPathBlock,
	resetSecurityPathBlocksForTesting,
} from './security-path-blocks';

describe('security-path-blocks', () => {
	beforeEach(() => {
		resetSecurityPathBlocksForTesting();
	});

	test('blocks normalized path matches and supports unblock flow', async () => {
		const created = await createSecurityPathBlock({
			path: '/.cursor/mcp.json',
			reason: 'Known scanner target',
			actorUserId: 99,
		});

		expect(created.normalizedPath).toBe('/.cursor/mcp.json');
		expect(created.matchType).toBe('exact');
		expect(created.active).toBe(true);

		const matchWithCase = await matchActiveSecurityPathBlock('/.CURSOR/mcp.json');
		expect(matchWithCase.blocked).toBe(true);
		expect(matchWithCase.pathBlockId).toBe(created.id);

		const removed = await removeSecurityPathBlock(created.id, 99);
		expect(removed).not.toBeNull();
		expect(removed?.active).toBe(false);

		const matchAfterRemove = await matchActiveSecurityPathBlock('/.cursor/mcp.json');
		expect(matchAfterRemove.blocked).toBe(false);
	});

	test('lists active path blocks with pagination', async () => {
		await createSecurityPathBlock({ path: '/.env', reason: 'Scanner probe' });
		await createSecurityPathBlock({ path: '/wp-login.php', reason: 'WordPress probe' });

		const listed = await listSecurityPathBlocks({ active: true, page: 1, pageSize: 10 });

		expect(listed.total).toBe(2);
		expect(listed.items).toHaveLength(2);
		expect(listed.items[0]?.active).toBe(true);
	});

	test('supports prefix path blocks for similar probe URLs', async () => {
		const created = await createSecurityPathBlock({
			path: '/.cursor',
			matchType: 'prefix',
			reason: 'Block scanner family',
		});

		expect(created.matchType).toBe('prefix');

		const prefixMatch = await matchActiveSecurityPathBlock('/.cursor/mcp.json');
		expect(prefixMatch.blocked).toBe(true);
		expect(prefixMatch.pathBlockId).toBe(created.id);

		const differentPath = await matchActiveSecurityPathBlock('/.git/config');
		expect(differentPath.blocked).toBe(false);
	});
});
