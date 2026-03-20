import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ScriptOptions {
	userId: number;
	confirm: boolean;
	dryRun: boolean;
}

function printUsage(): void {
	console.log(`
Delete all transactions for a specific user.

Usage:
  npx ts-node scripts/delete-all-transactions.ts --userId <id> [--dry-run] [--confirm]

Options:
  --userId <id>   Required. Target user id whose transactions will be deleted.
  --dry-run       Preview only. Prints how many transactions would be deleted.
  --confirm       Required to execute the deletion.

Examples:
  npx ts-node scripts/delete-all-transactions.ts --userId 12 --dry-run
  npx ts-node scripts/delete-all-transactions.ts --userId 12 --confirm
`);
}

function parseArgs(argv: string[]): ScriptOptions {
	const userIdIndex = argv.indexOf('--userId');
	const userIdValue = userIdIndex >= 0 ? argv[userIdIndex + 1] : undefined;
	const userId = Number(userIdValue);
	const confirm = argv.includes('--confirm');
	const dryRun = argv.includes('--dry-run');

	if (!userIdValue || !Number.isInteger(userId) || userId <= 0) {
		throw new Error('A valid positive integer `--userId` is required.');
	}

	return {
		userId,
		confirm,
		dryRun,
	};
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		printUsage();
		return;
	}

	const { userId, confirm, dryRun } = parseArgs(args);

	const transactionCount = await prisma.transaction.count({
		where: { userId },
	});

	console.log(`[delete-all-transactions] Target userId=${userId}`);
	console.log(`[delete-all-transactions] Transactions found=${transactionCount}`);

	if (dryRun) {
		console.log('[delete-all-transactions] Dry run enabled. No records were deleted.');
		return;
	}

	if (!confirm) {
		console.log('[delete-all-transactions] No action taken. Re-run with --confirm to delete these transactions.');
		return;
	}

	const result = await prisma.transaction.deleteMany({
		where: { userId },
	});

	console.log(`[delete-all-transactions] Deleted transactions=${result.count}`);
}

main()
	.catch((error: unknown) => {
		console.error('[delete-all-transactions] Failed:', error);
		printUsage();
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
