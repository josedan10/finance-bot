import path from 'node:path';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

const TARGET_ROLE = 'dev';

interface ScriptOptions {
	emails: string[];
	firebaseIds: string[];
	apply: boolean;
	allowNonUser: boolean;
}

function printUsage(): void {
	console.log(`
Assign database role "${TARGET_ROLE}" to specific internal users (allowlist only).

Safety:
  - Default is a dry run: no rows are updated unless you pass --apply.
  - Only rows you select via --emails and/or --firebaseIds are considered.
  - Users who already have role "${TARGET_ROLE}" are skipped.
  - By default, only users with role "user" are updated; use --allow-non-user to include
    accounts that already have another role (use with care).

Usage:
  npx ts-node scripts/assign-dev-role.ts --emails a@corp.com,b@corp.com
  npx ts-node scripts/assign-dev-role.ts --firebaseIds uid1,uid2 --apply
  npx ts-node scripts/assign-dev-role.ts --emails a@corp.com --firebaseIds uid1 --allow-non-user --apply

Options:
  --emails <csv>          Comma-separated emails (matched case-insensitively on LOWER(email)).
  --firebaseIds <csv>     Comma-separated Firebase UID values (exact match on firebaseId).
  --apply                 Perform updates (omit for dry run).
  --allow-non-user        Allow changing role when current role is not "user".
  --help, -h              Show this message.

Requires DATABASE_URL (e.g. from .env in finance-bot/).
`);
}

function splitCsv(value: string | undefined): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export function parseAssignDevRoleArgs(argv: string[]): ScriptOptions {
	const emailIndex = argv.indexOf('--emails');
	const emailArg = emailIndex >= 0 ? argv[emailIndex + 1] : undefined;
	const firebaseIndex = argv.indexOf('--firebaseIds');
	const firebaseArg = firebaseIndex >= 0 ? argv[firebaseIndex + 1] : undefined;

	const emails = splitCsv(emailArg).map((e) => e.toLowerCase());
	const firebaseIds = splitCsv(firebaseArg);

	if (emails.length === 0 && firebaseIds.length === 0) {
		throw new Error('Provide at least one of --emails or --firebaseIds.');
	}

	return {
		emails,
		firebaseIds,
		apply: argv.includes('--apply'),
		allowNonUser: argv.includes('--allow-non-user'),
	};
}

type UserRow = {
	id: number;
	firebaseId: string;
	email: string;
	role: string;
};

async function resolveTargets(emails: string[], firebaseIds: string[]): Promise<UserRow[]> {
	const byId = new Map<number, UserRow>();

	if (firebaseIds.length > 0) {
		const byFirebase = await prisma.user.findMany({
			where: { firebaseId: { in: firebaseIds } },
			select: { id: true, firebaseId: true, email: true, role: true },
		});
		for (const row of byFirebase) {
			byId.set(row.id, row);
		}
	}

	if (emails.length > 0) {
		const loweredChunks = emails.map((email) => Prisma.sql`${email}`);
		const byEmail = await prisma.$queryRaw<UserRow[]>(Prisma.sql`
			SELECT id, firebaseId, email, role
			FROM User
			WHERE LOWER(email) IN (${Prisma.join(loweredChunks)})
		`);
		for (const row of byEmail) {
			byId.set(row.id, row);
		}
	}

	return [...byId.values()].sort((a, b) => a.id - b.id);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		printUsage();
		return;
	}

	const options = parseAssignDevRoleArgs(args);
	const { emails, firebaseIds, apply, allowNonUser } = options;

	if (!process.env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set. Load it via .env or the environment before running this script.');
	}

	const targets = await resolveTargets(emails, firebaseIds);

	const matchedEmails = new Set(targets.map((t) => t.email.toLowerCase()));
	const matchedFirebase = new Set(targets.map((t) => t.firebaseId));

	const missingEmails = emails.filter((e) => !matchedEmails.has(e));
	const missingFirebase = firebaseIds.filter((id) => !matchedFirebase.has(id));

	console.log('[assign-dev-role] Dry run:', !apply);
	console.log('[assign-dev-role] allow-non-user:', allowNonUser);
	console.log('[assign-dev-role] Candidates matched in DB:', targets.length);

	if (missingEmails.length > 0) {
		console.log('[assign-dev-role] Emails not found (no User row with LOWER(email) match):', missingEmails.join(', ') || '(none)');
	}
	if (missingFirebase.length > 0) {
		console.log('[assign-dev-role] firebaseIds not found:', missingFirebase.join(', ') || '(none)');
	}

	const toSkipAlreadyDev = targets.filter((t) => t.role === TARGET_ROLE);
	const toSkipWrongRole = targets.filter((t) => t.role !== 'user' && t.role !== TARGET_ROLE && !allowNonUser);
	const eligible = targets.filter(
		(t) => t.role !== TARGET_ROLE && (allowNonUser || t.role === 'user')
	);

	if (toSkipAlreadyDev.length > 0) {
		console.log(
			'[assign-dev-role] Already dev (skipped):',
			toSkipAlreadyDev.map((t) => `${t.email} id=${t.id}`).join('; ') || '(none)'
		);
	}
	if (toSkipWrongRole.length > 0) {
		console.log(
			'[assign-dev-role] Skipped non-user role (re-run with --allow-non-user if intentional):',
			toSkipWrongRole.map((t) => `${t.email} id=${t.id} role=${t.role}`).join('; ') || '(none)'
		);
	}

	console.log('[assign-dev-role] Planned updates:', eligible.length);
	for (const row of eligible) {
		console.log(`  id=${row.id} email=${row.email} firebaseId=${row.firebaseId} ${row.role} -> ${TARGET_ROLE}`);
	}

	if (eligible.length === 0) {
		console.log('[assign-dev-role] Nothing to update.');
		return;
	}

	if (!apply) {
		console.log('[assign-dev-role] No database writes performed. Re-run with --apply to execute updates.');
		return;
	}

	const ids = eligible.map((r) => r.id);
	const result = await prisma.user.updateMany({
		where: {
			id: { in: ids },
			...(allowNonUser ? {} : { role: 'user' }),
		},
		data: { role: TARGET_ROLE },
	});

	if (result.count === ids.length) {
		console.log(`[assign-dev-role] Updated ${result.count} user(s) to role "${TARGET_ROLE}".`);
	} else {
		console.warn(
			`[assign-dev-role] Warning: updateMany affected ${result.count} rows but ${ids.length} were planned. ` +
				'Roles may have changed concurrently, or allow-non-user / role filter excluded some rows.'
		);
	}
}

if (require.main === module) {
	main()
		.catch((error: unknown) => {
			console.error('[assign-dev-role] Failed:', error);
			printUsage();
			process.exit(1);
		})
		.finally(async () => {
			await prisma.$disconnect();
		});
}
