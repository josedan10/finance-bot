import type { auth } from 'firebase-admin';

import { firebaseAdmin } from '../src/lib/firebase';
import logger from '../src/lib/logger';

export interface SafeFirebaseUserLog {
	uid: string;
	email: string | null;
	disabled: boolean;
}

type SafeUserRecordInput = Pick<auth.UserRecord, 'uid' | 'disabled'> & { email?: string | null };

export function toSafeFirebaseUserLog(userRecord: SafeUserRecordInput): SafeFirebaseUserLog {
	return {
		uid: userRecord.uid,
		email: userRecord.email ?? null,
		disabled: userRecord.disabled,
	};
}

export async function listAllUsers(
	authClient: Pick<auth.Auth, 'listUsers'>,
	log: (message: string, payload?: unknown) => void = (message, payload) => logger.info(message, payload),
	nextPageToken?: string
): Promise<void> {
	const result = await authClient.listUsers(100, nextPageToken);

	result.users.forEach((userRecord) => {
		log('User:', toSafeFirebaseUserLog(userRecord));
	});

	if (result.pageToken) {
		await listAllUsers(authClient, log, result.pageToken);
	}
}

export async function main(
	dependencies: {
		authClient?: Pick<auth.Auth, 'listUsers'>;
		log?: (message: string, payload?: unknown) => void;
		errorLog?: (message: string, error?: unknown) => void;
	} = {}
): Promise<number> {
	const log = dependencies.log ?? ((message: string, payload?: unknown) => logger.info(message, payload));
	const errorLog =
		dependencies.errorLog ?? ((message: string, error?: unknown) => logger.error(message, { error }));

	try {
		const authClient = dependencies.authClient ?? firebaseAdmin.auth();
		await listAllUsers(authClient, log);
		log('Finished listing users.');
		return 0;
	} catch (error) {
		errorLog('Error listing users:', error instanceof Error ? error.message : error);
		return 1;
	}
}

if (require.main === module) {
	main()
		.then((exitCode) => {
			process.exit(exitCode);
		})
		.catch((error) => {
			logger.error('Error listing users:', { error: error instanceof Error ? error.message : error });
			process.exit(1);
		});
}
