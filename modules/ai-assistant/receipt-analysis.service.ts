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
import { config } from '../../src/config';

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
	dateTime: string;
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

type ParsedReceiptFields = {
	date: string;
	dateTime?: string;
	amount: number;
	originalAmount: number;
	currency: string;
	description: string;
	category: string;
	categoryId?: number;
	type: 'credit' | 'debit';
	referenceId?: string;
};

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

type NormalizedReceiptDateTime = {
	date: string;
	dateTime: string;
};

type PreferredReceiptAmount = {
	amount: number;
	currency: string;
};

type PreferredReceiptAmountCandidate = PreferredReceiptAmount & {
	score: number;
};

const englishMonthMap: Record<string, string> = {
	january: '01',
	february: '02',
	march: '03',
	april: '04',
	may: '05',
	june: '06',
	july: '07',
	august: '08',
	september: '09',
	october: '10',
	november: '11',
	december: '12',
};

function extractReferenceIdFromReceiptText(rawText: string): string | null {
	const lines = rawText
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const labeledMatch = line.match(
			/\b(?:operation(?:\s+id)?|transaction(?:\s+id)?|reference(?:\s+id)?|operation|transacci[oó]n|operaci[oó]n|id)\b[\s#:.-]*([A-Z0-9-]{5,})/i
		);
		if (labeledMatch?.[1]) {
			return labeledMatch[1].trim();
		}

		const looseMatch = line.match(/\b[A-Z0-9]{3,}-[A-Z0-9-]{3,}\b/i);
		if (looseMatch?.[0]) {
			return looseMatch[0].trim();
		}
	}

	return null;
}

function normalizeReceiptCurrency(value: string | null | undefined): string {
	const normalized = value?.trim().toUpperCase() || 'USD';

	if (
		normalized === 'USDC' ||
		normalized === 'USDT' ||
		normalized === 'U$D' ||
		normalized === 'U$S' ||
		normalized === 'DOLAR' ||
		normalized === 'DÓLAR' ||
		normalized === 'DOLARES' ||
		normalized === 'DÓLARES'
	) {
		return 'USD';
	}

	if (normalized === 'EURO' || normalized === 'EUROS') {
		return 'EUR';
	}

	return normalized;
}

function normalizeAiReceiptDateTime(value: string | null | undefined): NormalizedReceiptDateTime | null {
	if (!value) return null;

	const normalized = value.trim();
	if (!normalized) return null;

	const isoDateOnly = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (isoDateOnly) {
		const [, year, month, day] = isoDateOnly;
		return {
			date: `${year}-${month}-${day}`,
			dateTime: `${year}-${month}-${day}T12:00:00`,
		};
	}

	const isoDateTime = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
	if (isoDateTime) {
		const [, year, month, day, hour, minute, second = '00'] = isoDateTime;
		return {
			date: `${year}-${month}-${day}`,
			dateTime: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
		};
	}

	const latinDateTime = normalized.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
	if (latinDateTime) {
		const [, day, month, year, rawHour = '12', minute = '00', second = '00', meridiem] = latinDateTime;
		let hour = Number.parseInt(rawHour, 10);
		if (meridiem) {
			hour %= 12;
			if (meridiem.toLowerCase() === 'pm') {
				hour += 12;
			}
		}

		const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
		return {
			date: normalizedDate,
			dateTime: `${normalizedDate}T${String(hour).padStart(2, '0')}:${minute}:${second}`,
		};
	}

	const parsed = new Date(normalized);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	const year = parsed.getUTCFullYear();
	const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
	const day = String(parsed.getUTCDate()).padStart(2, '0');
	const hours = String(parsed.getUTCHours()).padStart(2, '0');
	const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
	const seconds = String(parsed.getUTCSeconds()).padStart(2, '0');

	return {
		date: `${year}-${month}-${day}`,
		dateTime: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`,
	};
}

function extractPreferredSettlementAmount(rawText: string): PreferredReceiptAmount | null {
	const lines = rawText
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	const stableCurrencyPattern =
		/(USDC|USDT|USD|U\$D|U\$S|DOLARES?|DÓLARES?|EUR|EUROS?)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)\s*(USDC|USDT|USD|U\$D|U\$S|DOLARES?|DÓLARES?|EUR|EUROS?)/gi;
	const candidates: PreferredReceiptAmountCandidate[] = [];

	for (const [index, line] of lines.entries()) {
		const lowered = line.toLowerCase();
		const previousLine = index > 0 ? lines[index - 1]?.toLowerCase() || '' : '';
		const nextLine = index < lines.length - 1 ? lines[index + 1]?.toLowerCase() || '' : '';
		const looksLikeExchangeRate =
			lowered.includes('exchange rate') ||
			lowered.includes('tipo de cambio') ||
			lowered.includes('tasa') ||
			lowered.includes('cotizacion') ||
			lowered.includes('cotización') ||
			(lowered.includes(' ars') && lowered.includes(' usd')) ||
			(lowered.includes(' ars') && lowered.includes(' usdc')) ||
			(lowered.includes(' ars') && lowered.includes(' usdt')) ||
			line.includes('=') ||
			line.includes('/');

		if (looksLikeExchangeRate) {
			continue;
		}

		const hasSettlementKeywords = (value: string) =>
			value.includes('discounted') ||
			value.includes('debited') ||
			value.includes('charged') ||
			value.includes('descont') ||
			value.includes('cobrado') ||
			value.includes('charged to balance') ||
			value.includes('you paid') ||
			value.includes('pay with');

		const settlementScore =
			lowered.includes('discounted') ||
			lowered.includes('debited') ||
			lowered.includes('charged') ||
			lowered.includes('descont') ||
			lowered.includes('cobrado') ||
			lowered.includes('charged to balance') ||
			lowered.includes('you paid') ||
			lowered.includes('pay with');
		const nearbySettlementScore = hasSettlementKeywords(previousLine) || hasSettlementKeywords(nextLine);

		for (const match of line.matchAll(stableCurrencyPattern)) {
			const leadingCurrency = match[1]?.toUpperCase();
			const leadingAmount = match[2];
			const trailingAmount = match[3];
			const trailingCurrency = match[4]?.toUpperCase();
			const currency = leadingCurrency || trailingCurrency;
			const rawAmount = leadingAmount || trailingAmount;

			if (!currency || !rawAmount) {
				continue;
			}

			const normalizedAmount = rawAmount.includes(',') && rawAmount.includes('.')
				? rawAmount.lastIndexOf(',') > rawAmount.lastIndexOf('.')
					? rawAmount.replaceAll('.', '').replace(',', '.')
					: rawAmount.replaceAll(',', '')
				: rawAmount.replace(',', '.');
			const amount = Number(normalizedAmount);

			if (!Number.isFinite(amount) || amount <= 0) {
				continue;
			}

			let score = settlementScore ? 10 : nearbySettlementScore ? 8 : 1;
			if (
				currency === 'USDC' ||
				currency === 'USDT' ||
				currency === 'USD' ||
				currency === 'U$D' ||
				currency === 'U$S' ||
				currency === 'DOLARES' ||
				currency === 'DÓLARES'
			) {
				score += 5;
			}
			if (lowered.includes('balance') || lowered.includes('wallet')) {
				score += 2;
			}
			if (lowered.includes('discounted') || lowered.includes('debited') || lowered.includes('charged to balance')) {
				score += 3;
			}
			if (nearbySettlementScore) {
				score += 2;
			}

			candidates.push({
				amount,
				currency: normalizeReceiptCurrency(currency),
				score,
			});
		}
	}

	if (candidates.length === 0) {
		return null;
	}

	const bestCandidate = candidates.sort((left, right) => right.score - left.score || right.amount - left.amount)[0];
	return bestCandidate ? { amount: bestCandidate.amount, currency: bestCandidate.currency } : null;
}

function extractVisibleReceiptDateTime(rawText: string): NormalizedReceiptDateTime | null {
	const lines = rawText
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const normalizedFromDirectLine = normalizeAiReceiptDateTime(line);
		if (normalizedFromDirectLine) {
			return normalizedFromDirectLine;
		}

			const latinMatch = line.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)?)/i);
		if (latinMatch) {
			const normalizedLatin = normalizeAiReceiptDateTime(latinMatch[1]);
			if (normalizedLatin) {
				return normalizedLatin;
			}
		}

		const englishMatch = line.match(
				/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm))?/i
			);
		if (englishMatch) {
			const [, monthName, rawDay, year, rawHour = '12', minute = '00', meridiem] = englishMatch;
			let hour = Number.parseInt(rawHour, 10);
			if (meridiem) {
				hour %= 12;
				if (meridiem.toLowerCase() === 'pm') {
					hour += 12;
				}
			}

			const month = englishMonthMap[monthName.toLowerCase()];
			if (!month) {
				continue;
			}

			const day = rawDay.padStart(2, '0');
			const normalizedDate = `${year}-${month}-${day}`;
			return {
				date: normalizedDate,
				dateTime: `${normalizedDate}T${String(hour).padStart(2, '0')}:${minute}:00`,
			};
		}
	}

	return null;
}

export async function analyzeReceiptImageForUser(params: {
	userId: number;
	imageInput: OCRImageInput;
	requestId?: string | null;
}): Promise<ReceiptAnalysisOutput> {
	const categories = await prisma.category.findMany({
		where: { userId: params.userId },
		select: { id: true, name: true },
	});
	const categoryMap = new Map(categories.map((category) => [category.name.toLowerCase(), category]));

	let aiStructuredResult: Awaited<ReturnType<typeof Image2TextService.analyzeReceiptWithGemini>> | null = null;

	if (config.GOOGLE_AI_API_KEY) {
		try {
			aiStructuredResult = await Image2TextService.analyzeReceiptWithGemini(
				params.imageInput,
				['Other', ...categories.map((category) => category.name)],
				params.requestId || undefined
			);
		} catch (error) {
			logger.warn('Structured Gemini receipt analysis failed, falling back to OCR text parsing', {
				userId: params.userId,
				requestId: params.requestId || null,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	let extractedReceipt:
		| {
				text: string;
				metadata?: {
					capturedAt?: string | null;
					deviceModel?: string | null;
					deviceMake?: string | null;
				};
		  }
		| undefined;
	let rawText = aiStructuredResult?.rawText?.trim() || '';

	if (!rawText) {
		const extractedTexts = await Image2TextService.extractTextFromImages([params.imageInput], params.requestId || undefined);

		if (!extractedTexts || extractedTexts.length === 0) {
			throw new AppError('Could not extract text from image', 422);
		}

		extractedReceipt = extractedTexts[0];
		rawText = extractedReceipt.text;
	}

	const textLines = rawText.split('\n');
	let parsed: ParsedReceiptFields | null = null;
	let duplicate = null;
	let beloWithdrawMatch: OcrReceiptMatch | null = null;
	let requiresManualReview = true;
	let parseWarning: string | null = null;

	try {
		const structuredCategory =
			aiStructuredResult?.category && aiStructuredResult.category !== 'Other'
				? categoryMap.get(aiStructuredResult.category.toLowerCase())
				: null;
		const structuredDateTime =
			normalizeAiReceiptDateTime(aiStructuredResult?.dateTime) ||
			extractVisibleReceiptDateTime(aiStructuredResult?.rawText || rawText);
		const extractedReferenceId = aiStructuredResult?.referenceId?.trim() || extractReferenceIdFromReceiptText(aiStructuredResult?.rawText || rawText);
		const preferredSettlementAmount = aiStructuredResult?.rawText
			? extractPreferredSettlementAmount(aiStructuredResult.rawText)
			: null;

		if (
			aiStructuredResult &&
			typeof aiStructuredResult.amount === 'number' &&
			Number.isFinite(aiStructuredResult.amount) &&
			aiStructuredResult.description &&
			structuredDateTime
		) {
			parsed = {
				date: structuredDateTime.date,
				dateTime: structuredDateTime.dateTime,
				amount: preferredSettlementAmount?.amount ?? aiStructuredResult.amount,
				originalAmount: preferredSettlementAmount?.amount ?? aiStructuredResult.amount,
				currency: normalizeReceiptCurrency(preferredSettlementAmount?.currency ?? aiStructuredResult.currency ?? 'USD'),
				description: aiStructuredResult.description,
				category: structuredCategory?.name || 'Other',
				categoryId: structuredCategory?.id,
				type: aiStructuredResult.type === 'income' ? 'credit' : 'debit',
				referenceId: extractedReferenceId || undefined,
			};
		} else {
			parsed = await BaseTransactions.parseTransactionFromText(textLines, params.userId);
		}

		if (!parsed) {
			throw new Error('Could not parse receipt fields automatically');
		}

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

	const fallback = buildManualReviewFallback(rawText);
	const parsedDateTime = parsed?.dateTime || (parsed?.date ? `${parsed.date}T12:00:00` : null);
	const finalDate = parsed?.date || fallback.date;
	const finalDateTime = parsedDateTime || `${fallback.date}T12:00:00`;

	return {
		date: finalDate,
		dateTime: finalDateTime,
		description: parsed?.description || fallback.description,
		amount: parsed?.amount || fallback.amount,
		category: parsed?.category || fallback.category,
		type: mapParsedTypeToApiType(parsed?.type || fallback.type),
		currency: normalizeReceiptCurrency(parsed?.currency || fallback.currency),
		referenceId: parsed?.referenceId ?? fallback.referenceId,
		isDuplicate: Boolean(duplicate),
		duplicateId: duplicate?.id,
		beloWithdrawMatch,
		rawText,
		textLines,
		requiresManualReview,
		parseWarning,
		imageMetadata: extractedReceipt?.metadata,
		metadataDateTimeSuggestion: formatMetadataDateTime(extractedReceipt?.metadata?.capturedAt),
	};
}
