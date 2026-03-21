import type { auth } from 'firebase-admin';

import { listAllUsers, main, toSafeFirebaseUserLog } from './list-firebase-users';

describe('list-firebase-users script', () => {
	it('logs only a minimal non-sensitive subset of firebase users', async () => {
		const log = jest.fn();
		const authClient = {
			listUsers: jest
				.fn<Promise<auth.ListUsersResult>, [number, string?]>()
				.mockResolvedValue({
					users: [
						{
							uid: 'user-1',
							email: 'person@example.com',
							disabled: false,
							toJSON: jest.fn(),
						} as unknown as auth.UserRecord,
					],
					pageToken: undefined,
				}),
		};

		await listAllUsers(authClient, log);

		expect(log).toHaveBeenCalledWith('User:', {
			uid: 'user-1',
			email: 'person@example.com',
			disabled: false,
		});
	});

	it('maps firebase users to a safe log payload', () => {
		expect(
			toSafeFirebaseUserLog({
				uid: 'user-2',
				email: null,
				disabled: true,
			})
		).toEqual({
			uid: 'user-2',
			email: null,
			disabled: true,
		});
	});

	it('returns exit code 1 when firebase listing fails', async () => {
		const log = jest.fn();
		const errorLog = jest.fn();
		const authClient = {
			listUsers: jest.fn().mockRejectedValue(new Error('firebase failure')),
		};

		const exitCode = await main({ authClient, log, errorLog });

		expect(exitCode).toBe(1);
		expect(errorLog).toHaveBeenCalledWith('Error listing users:', 'firebase failure');
		expect(log).not.toHaveBeenCalledWith('Finished listing users.');
	});
});
