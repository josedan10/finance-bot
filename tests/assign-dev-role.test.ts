import { describe, expect, it } from '@jest/globals';

import { parseAssignDevRoleArgs } from '../scripts/assign-dev-role';

describe('assign-dev-role script', () => {
	it('parses emails and flags', () => {
		expect(
			parseAssignDevRoleArgs(['--emails', 'A@X.com, B@Y.com ', '--apply', '--allow-non-user'])
		).toEqual({
			emails: ['a@x.com', 'b@y.com'],
			firebaseIds: [],
			apply: true,
			allowNonUser: true,
		});
	});

	it('parses firebaseIds', () => {
		expect(parseAssignDevRoleArgs(['--firebaseIds', 'uid-1,uid-2'])).toEqual({
			emails: [],
			firebaseIds: ['uid-1', 'uid-2'],
			apply: false,
			allowNonUser: false,
		});
	});

	it('requires at least one selector', () => {
		expect(() => parseAssignDevRoleArgs([])).toThrow(/emails or --firebaseIds/);
	});
});
