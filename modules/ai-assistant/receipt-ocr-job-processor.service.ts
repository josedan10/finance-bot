import { PrismaModule as prisma } from '../database/database.module';
import { BaseTransactions, mapTransactionType } from '../base-transactions/base-transactions.module';
import { analyzeReceiptImageForUser, type ReceiptAnalysisOutput } from './receipt-analysis.service';
import type { ReceiptOcrQueueJob } from './receipt-ocr-queue.service';
import { AppError } from '../../src/lib/appError';

export type ReceiptAutoCreatedTransactionPreview = {
	id: number;
	date: string;
	description: string;
	amount: number;
	currency: string;
	category: string;
	type: 'income' | 'expense';
	referenceId: string | null;
	isDuplicate: boolean;
};

export type ProcessedReceiptOcrJobResult = ReceiptAnalysisOutput & {
	dateTime: string;
	createdTransaction: ReceiptAutoCreatedTransactionPreview;
};

function getReceiptTimeZoneOffsetMs(date: Date, timeZone: string): number {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
	const parts = formatter.formatToParts(date);
	const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
	const zonedTimestamp = Date.UTC(
		Number(values.year),
		Number(values.month) - 1,
		Number(values.day),
		Number(values.hour),
		Number(values.minute),
		Number(values.second)
	);

	return zonedTimestamp - date.getTime();
}

function convertReceiptLocalDateTimeToUtc(dateTime: string, timeZone: string | null | undefined): string {
	const normalizedTimeZone = timeZone?.trim();
	if (!normalizedTimeZone) {
		return dateTime;
	}

	const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
	if (!match) {
		return dateTime;
	}

	const [, year, month, day, hour, minute, second = '00'] = match;
	const utcGuess = new Date(Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second)
	));
	const offsetMs = getReceiptTimeZoneOffsetMs(utcGuess, normalizedTimeZone);
	return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

function getQueueTransactionDateTime(
	result: Pick<ReceiptAnalysisOutput, 'date'> & { dateTime?: string | null },
	timeZone?: string | null
): string {
	if (result.dateTime && result.dateTime.trim()) {
		return convertReceiptLocalDateTimeToUtc(result.dateTime.trim(), timeZone);
	}

	return convertReceiptLocalDateTimeToUtc(`${result.date}T12:00:00`, timeZone);
}

async function getOrCreateOtherCategory(userId: number) {
	const existing = await prisma.category.findUnique({
		where: {
			name_userId: {
				name: 'Other',
				userId,
			},
		},
	});

	if (existing) {
		return existing;
	}

	return prisma.category.create({
		data: {
			userId,
			name: 'Other',
			description: 'Fallback category for auto-created receipt transactions pending user review.',
			amountLimit: 0,
			isCumulative: false,
		},
	});
}

async function findKeywordMatchedCategory(userId: number, description: string) {
	const normalizedDescription = description.trim().toLowerCase();

	if (!normalizedDescription) {
		return null;
	}

	const categories = await prisma.category.findMany({
		where: { userId },
		select: {
			id: true,
			name: true,
			categoryKeyword: {
				select: {
					keyword: {
						select: {
							name: true,
						},
					},
				},
			},
		},
	});

	const candidates = categories
		.map((category) => {
			const matchedKeywords = category.categoryKeyword
				.map((entry) => entry.keyword.name.trim().toLowerCase())
				.filter((keyword) => keyword.length > 0 && normalizedDescription.includes(keyword));

			if (matchedKeywords.length === 0) {
				return null;
			}

			const longestKeywordLength = matchedKeywords.reduce(
				(maxLength, keyword) => Math.max(maxLength, keyword.length),
				0
			);

			return {
				id: category.id,
				name: category.name,
				matchCount: matchedKeywords.length,
				longestKeywordLength,
			};
		})
		.filter(
			(
				candidate
			): candidate is {
				id: number;
				name: string;
				matchCount: number;
				longestKeywordLength: number;
			} => candidate !== null
		)
		.sort((left, right) => {
			if (right.longestKeywordLength !== left.longestKeywordLength) {
				return right.longestKeywordLength - left.longestKeywordLength;
			}

			if (right.matchCount !== left.matchCount) {
				return right.matchCount - left.matchCount;
			}

			return left.name.localeCompare(right.name);
		});

	return candidates[0] ?? null;
}

function normalizeCreatedTransactionPreview(
	transaction: {
		id: number;
		date: Date;
		description: string | null;
		amount: unknown;
		currency: string;
		type: string;
		referenceId: string | null;
		category?: { name: string } | null;
	},
	isDuplicate: boolean
): ReceiptAutoCreatedTransactionPreview {
	return {
		id: transaction.id,
		date: transaction.date.toISOString(),
		description: transaction.description || 'Scanned receipt',
		amount: Number(transaction.amount || 0),
		currency: transaction.currency,
		category: transaction.category?.name || 'Other',
		type: transaction.type === 'credit' ? 'income' : 'expense',
		referenceId: transaction.referenceId || null,
		isDuplicate,
	};
}

export async function processReceiptOcrJob(job: ReceiptOcrQueueJob): Promise<ProcessedReceiptOcrJobResult> {
	const result = await analyzeReceiptImageForUser({
		userId: job.userId,
		requestId: job.requestId || job.id,
		imageInput: {
			type: 'image-source',
			value: job.image.publicUrl,
		},
	});

	if (!result.description.trim()) {
		throw new AppError('Receipt description could not be extracted automatically', 422);
	}

	if (!Number.isFinite(result.amount) || result.amount <= 0) {
		throw new AppError('Receipt amount could not be extracted automatically', 422);
	}

	const normalizedType = mapTransactionType(result.type);
	if (!normalizedType) {
		throw new AppError('Receipt transaction type could not be normalized', 422);
	}

	const keywordMatchedCategory = await findKeywordMatchedCategory(job.userId, result.description.trim());
	const fallbackCategory = keywordMatchedCategory ?? (await getOrCreateOtherCategory(job.userId));
	const { transaction, isDuplicate } = await BaseTransactions.safeCreateTransaction({
		userId: job.userId,
		date: getQueueTransactionDateTime(result, job.timeZone),
		description: result.description.trim(),
		amount: result.amount,
		currency: result.currency,
		type: normalizedType,
		referenceId: result.referenceId?.trim() || null,
		categoryId: fallbackCategory.id,
		reviewed: false,
	});

	return {
		...result,
		dateTime: getQueueTransactionDateTime(result, job.timeZone),
		createdTransaction: normalizeCreatedTransactionPreview(transaction, isDuplicate),
	};
}
