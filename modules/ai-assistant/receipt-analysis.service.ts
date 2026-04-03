import { PrismaModule as prisma } from '../database/database.module';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { Image2TextService, type OCRImageInput } from '../image-2-text/image-2-text.module';
import logger from '../../src/lib/logger';
import { AppError } from '../../src/lib/appError';
import {
	getBeloWithdrawCommissionFromGross,
	getBeloWithdrawGrossFromReceiptAmount,
	isBeloWithdrawDescription,
} from '../../src/helpers/belo-withdraw.helper';

export interface OcrReceiptMatch {
	id: number;
	date: string;
	description: string | null;
	grossAmount: number;
	expectedNetAmount: number;
	commissionAmount: number;
}

export interface ReceiptAnalysisOutput {
	date: string;
	description: string;
	amount: number;
	category: string;
	type: 'income' | 'expense';
	currency: string;
	referenceId?: string;
	isDuplicate: boolean;
	duplicateId?: number;
	beloWithdrawMatch: OcrReceiptMatch | null;
	rawText: string;
	textLines: string[];
	requiresManualReview: boolean;
	parseWarning: string | null;
	imageMetadata?: {
		capturedAt?: string | null;
		deviceModel?: string | null;
		deviceMake?: string | null;
	};
	metadataDateTimeSuggestion: string | null;
}

function formatMetadataDateTime(value: string | null | undefined): string | null {
	if (!value) return null;

	const normalized = value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
	const parsed = new Date(normalized);

	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	const year = parsed.getFullYear();
	const month = String(parsed.getMonth() + 1).padStart(2, '0');
	const day = String(parsed.getDate()).padStart(2, '0');
	const hours = String(parsed.getHours()).padStart(2, '0');
	const minutes = String(parsed.getMinutes()).padStart(2, '0');

	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function findMatchingBeloWithdraw(
	userId: number,
	parsed: {
		amount: number;
		date: string;
		currency: string;
	}
): Promise<OcrReceiptMatch | null> {
	const receiptDate = new Date(parsed.date);
	const dayStart = new Date(receiptDate);
	dayStart.setHours(0, 0, 0, 0);
	const dayEnd = new Date(receiptDate);
	dayEnd.setHours(23, 59, 59, 999);
	const expectedGrossAmount = getBeloWithdrawGrossFromReceiptAmount(parsed.amount);

	const candidates = await prisma.transaction.findMany({
		where: {
			userId,
			type: 'debit',
			currency: parsed.currency,
			date: {
				gte: dayStart,
				lte: dayEnd,
			},
		},
		orderBy: { date: 'desc' },
	});

	const withdrawCandidates = candidates.filter((transaction) => isBeloWithdrawDescription(transaction.description));

	if (withdrawCandidates.length === 0) {
		return null;
	}

	const bestMatch = withdrawCandidates
		.map((transaction) => {
			const grossAmount = Number(transaction.amount || 0);
			return {
				transaction,
				amountDifference: Math.abs(grossAmount - expectedGrossAmount),
			};
		})
		.sort((left, right) => left.amountDifference - right.amountDifference)[0];

	if (!bestMatch || bestMatch.amountDifference > 5) {
		return null;
	}

	const grossAmount = Number(bestMatch.transaction.amount || 0);

	return {
		id: bestMatch.transaction.id,
		date: bestMatch.transaction.date.toISOString(),
		description: bestMatch.transaction.description,
		grossAmount,
		expectedNetAmount: parsed.amount,
		commissionAmount: getBeloWithdrawCommissionFromGross(grossAmount),
	};
}

function buildManualReviewFallback(rawText: string): Pick<
	ReceiptAnalysisOutput,
	'date' | 'description' | 'amount' | 'category' | 'type' | 'currency' | 'referenceId'
> {
	const description = rawText
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 2);

	return {
		date: new Date().toISOString().split('T')[0],
		description: description || 'Scanned receipt',
		amount: 0,
		category: 'Other',
		type: 'expense',
		currency: 'USD',
		referenceId: '',
	};
}

function mapParsedTypeToApiType(type: string | null | undefined): 'income' | 'expense' {
	if (!type) {
		return 'expense';
	}

	if (type === 'credit' || type === 'income') {
		return 'income';
	}

	return 'expense';
}

export async function analyzeReceiptImageForUser(params: {
	userId: number;
	imageInput: OCRImageInput;
	requestId?: string | null;
}): Promise<ReceiptAnalysisOutput> {
	const extractedTexts = await Image2TextService.extractTextFromImages([params.imageInput], params.requestId || undefined);

	if (!extractedTexts || extractedTexts.length === 0) {
		throw new AppError('Could not extract text from image', 422);
	}

	const extractedReceipt = extractedTexts[0];
	const textLines = extractedReceipt.text.split('\n');
	let parsed: Awaited<ReturnType<typeof BaseTransactions.parseTransactionFromText>> | null = null;
	let duplicate = null;
	let beloWithdrawMatch: OcrReceiptMatch | null = null;
	let requiresManualReview = true;
	let parseWarning: string | null = null;

	try {
		parsed = await BaseTransactions.parseTransactionFromText(textLines, params.userId);
		requiresManualReview = false;

		duplicate = await BaseTransactions.findDuplicate({
			userId: params.userId,
			amount: parsed.amount,
			date: new Date(parsed.date),
			type: parsed.type,
			currency: parsed.currency,
			description: parsed.description,
		});

		beloWithdrawMatch = await findMatchingBeloWithdraw(params.userId, {
			amount: parsed.amount,
			date: parsed.date,
			currency: parsed.currency,
		});
	} catch (parseError) {
		parseWarning =
			parseError instanceof Error ? parseError.message : 'Could not parse receipt fields automatically';
		logger.warn('Receipt OCR extracted text but automatic parsing needs manual review', {
			userId: params.userId,
			warning: parseWarning,
			requestId: params.requestId || null,
		});
	}

	const fallback = buildManualReviewFallback(extractedReceipt.text);

	return {
		date: parsed?.date || fallback.date,
		description: parsed?.description || fallback.description,
		amount: parsed?.amount || fallback.amount,
		category: parsed?.category || fallback.category,
		type: mapParsedTypeToApiType(parsed?.type || fallback.type),
		currency: parsed?.currency || fallback.currency,
		referenceId: fallback.referenceId,
		isDuplicate: Boolean(duplicate),
		duplicateId: duplicate?.id,
		beloWithdrawMatch,
		rawText: extractedReceipt.text,
		textLines,
		requiresManualReview,
		parseWarning,
		imageMetadata: extractedReceipt.metadata,
		metadataDateTimeSuggestion: formatMetadataDateTime(extractedReceipt.metadata?.capturedAt),
	};
}
