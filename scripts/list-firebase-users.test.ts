import type { auth } from 'firebase-admin';
import { describe, expect, it, jest } from '@jest/globals';

import { firebaseAdmin } from '../src/lib/firebase';
import { listAllUsers, main, toSafeFirebaseUserLog } from './list-firebase-users';

describe('list-firebase-users script', () => {
	it('logs only a minimal non-sensitive subset of firebase users', async () => {
		const log = jest.fn();
		const listUsers = jest.fn(async () => ({
			users: [
				{
					uid: 'user-1',
					email: 'person@example.com',
					disabled: false,
					toJSON: jest.fn(),
				} as unknown as auth.UserRecord,
			],
			pageToken: undefined,
		})) as unknown as Pick<auth.Auth, 'listUsers'>['listUsers'];
		const authClient = {
			listUsers,
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
		const listUsers = jest.fn(async () => {
			throw new Error('firebase failure');
		}) as unknown as Pick<auth.Auth, 'listUsers'>['listUsers'];
		const authClient = {
			listUsers,
		};

		const exitCode = await main({ authClient, log, errorLog });

		expect(exitCode).toBe(1);
		expect(errorLog).toHaveBeenCalledWith('Error listing users:', 'firebase failure');
		expect(log).not.toHaveBeenCalledWith('Finished listing users.');
	});

	it('returns exit code 1 when auth client resolution fails before listing users', async () => {
		const log = jest.fn();
		const errorLog = jest.fn();
		const authSpy = jest.spyOn(firebaseAdmin, 'auth').mockImplementation(() => {
			throw new Error('app/no-app');
		});

		const exitCode = await main({ log, errorLog });

		expect(exitCode).toBe(1);
		expect(errorLog).toHaveBeenCalledWith('Error listing users:', 'app/no-app');
		authSpy.mockRestore();
	});
});
