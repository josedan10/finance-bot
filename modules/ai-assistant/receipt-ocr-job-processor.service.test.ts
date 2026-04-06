import { processReceiptOcrJob } from './receipt-ocr-job-processor.service';
import { analyzeReceiptImageForUser } from './receipt-analysis.service';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { PrismaModule as prisma } from '../database/database.module';

jest.mock('./receipt-analysis.service', () => ({
	analyzeReceiptImageForUser: jest.fn(),
}));

jest.mock('../base-transactions/base-transactions.module', () => {
	const actual = jest.requireActual('../base-transactions/base-transactions.module');
	return {
		...actual,
		BaseTransactions: {
			safeCreateTransaction: jest.fn(),
		},
	};
});

jest.mock('../database/database.module', () => ({
	PrismaModule: {
		category: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			create: jest.fn(),
		},
	},
}));

describe('receipt-ocr-job-processor.service', () => {
	const mockedAnalyzeReceiptImageForUser = analyzeReceiptImageForUser as jest.MockedFunction<typeof analyzeReceiptImageForUser>;
	const mockedBaseTransactions = BaseTransactions as jest.Mocked<typeof BaseTransactions>;
	const mockedPrisma = prisma as unknown as {
		category: {
			findUnique: jest.Mock;
			findMany: jest.Mock;
			create: jest.Mock;
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockedPrisma.category.findMany.mockResolvedValue([]);
		mockedPrisma.category.findUnique.mockResolvedValue({ id: 7, name: 'Other' });
		mockedBaseTransactions.safeCreateTransaction.mockResolvedValue({
			transaction: {
				id: 42,
				date: new Date('2026-04-04T14:45:00.000Z'),
				description: 'Coffee shop',
				amount: 19.5,
				currency: 'USD',
				type: 'debit',
				referenceId: 'ref-123',
				category: { name: 'Other' },
			},
			isDuplicate: false,
		} as never);
	});

	it('creates an Other transaction automatically from a completed OCR result', async () => {
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-04',
			dateTime: '2026-04-04T14:45:00',
			description: 'Coffee shop',
			amount: 19.5,
			category: 'Food & Dining',
			type: 'expense',
			currency: 'USD',
			referenceId: 'ref-123',
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: 'Coffee shop\n19.5',
			textLines: ['Coffee shop', '19.5'],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		const result = await processReceiptOcrJob({
			id: 'job-1',
			userId: 2,
			status: 'processing',
			reviewStatus: 'pending_review',
			reviewedAt: null,
			timeZone: 'America/Argentina/Buenos_Aires',
			createdAt: '2026-04-04T14:00:00.000Z',
			updatedAt: '2026-04-04T14:00:00.000Z',
			attempts: 1,
			maxAttempts: 3,
			requestId: 'req-1',
			image: {
				publicUrl: 'https://example.com/receipt.jpg',
				filePath: '/tmp/receipt.jpg',
				fileName: 'receipt.jpg',
				size: 123,
			},
		});

		expect(mockedAnalyzeReceiptImageForUser).toHaveBeenCalledWith({
			userId: 2,
			requestId: 'req-1',
			imageInput: {
				type: 'image-source',
				value: 'https://example.com/receipt.jpg',
			},
		});
		expect(mockedBaseTransactions.safeCreateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 2,
				date: '2026-04-04T17:45:00.000Z',
				description: 'Coffee shop',
				amount: 19.5,
				currency: 'USD',
				type: 'debit',
				categoryId: 7,
			})
		);
		expect(result.createdTransaction).toEqual({
			id: 42,
			date: '2026-04-04T14:45:00.000Z',
			description: 'Coffee shop',
			amount: 19.5,
			currency: 'USD',
			category: 'Other',
			type: 'expense',
			referenceId: 'ref-123',
			isDuplicate: false,
		});
	});

	it('creates the Other category if the user does not have it yet', async () => {
		mockedPrisma.category.findUnique.mockResolvedValue(null);
		mockedPrisma.category.create.mockResolvedValue({ id: 11, name: 'Other' });
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-05',
			dateTime: '2026-04-05T12:00:00',
			description: 'Market',
			amount: 45,
			category: 'Other',
			type: 'expense',
			currency: 'USD',
			referenceId: '',
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: 'Market',
			textLines: ['Market'],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		await processReceiptOcrJob({
			id: 'job-2',
			userId: 9,
			status: 'processing',
			reviewStatus: 'pending_review',
			reviewedAt: null,
			timeZone: 'America/Argentina/Buenos_Aires',
			createdAt: '2026-04-05T10:00:00.000Z',
			updatedAt: '2026-04-05T10:00:00.000Z',
			attempts: 1,
			maxAttempts: 3,
			image: {
				publicUrl: 'https://example.com/receipt-2.jpg',
				filePath: '/tmp/receipt-2.jpg',
				fileName: 'receipt-2.jpg',
				size: 456,
			},
		});

		expect(mockedPrisma.category.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				userId: 9,
				name: 'Other',
			}),
		});
		expect(mockedBaseTransactions.safeCreateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: 11 })
		);
	});

	it('uses a keyword-matched category before falling back to Other', async () => {
		mockedPrisma.category.findMany.mockResolvedValue([
			{
				id: 21,
				name: 'Food & Dining',
				categoryKeyword: [
					{ keyword: { name: 'cremolatti' } },
				],
			},
		]);
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-05',
			dateTime: '2026-04-05T18:00:00',
			description: 'QR payment to Cremolatti Villa Ortuzar',
			amount: 2.17,
			category: 'Other',
			type: 'expense',
			currency: 'USD',
			referenceId: 'ref-22',
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: 'Cremolatti',
			textLines: ['Cremolatti'],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});
		mockedBaseTransactions.safeCreateTransaction.mockResolvedValue({
			transaction: {
				id: 99,
				date: new Date('2026-04-05T21:00:00.000Z'),
				description: 'QR payment to Cremolatti Villa Ortuzar',
				amount: 2.17,
				currency: 'USD',
				type: 'debit',
				referenceId: 'ref-22',
				category: { name: 'Food & Dining' },
			},
			isDuplicate: false,
		} as never);

		const result = await processReceiptOcrJob({
			id: 'job-3',
			userId: 4,
			status: 'processing',
			reviewStatus: 'pending_review',
			reviewedAt: null,
			timeZone: 'America/Argentina/Buenos_Aires',
			createdAt: '2026-04-05T18:00:00.000Z',
			updatedAt: '2026-04-05T18:00:00.000Z',
			attempts: 1,
			maxAttempts: 3,
			image: {
				publicUrl: 'https://example.com/receipt-3.jpg',
				filePath: '/tmp/receipt-3.jpg',
				fileName: 'receipt-3.jpg',
				size: 456,
			},
		});

		expect(mockedBaseTransactions.safeCreateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: 21 })
		);
		expect(result.createdTransaction.category).toBe('Food & Dining');
	});

	it('falls back to noon local time when dateTime is missing', async () => {
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-06',
			dateTime: '',
			description: 'Lunch',
			amount: 12,
			category: 'Other',
			type: 'expense',
			currency: 'USD',
			referenceId: undefined,
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: 'Lunch',
			textLines: ['Lunch'],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		await processReceiptOcrJob({
			id: 'job-4',
			userId: 2,
			status: 'processing',
			reviewStatus: 'pending_review',
			reviewedAt: null,
			timeZone: 'America/Argentina/Buenos_Aires',
			createdAt: '2026-04-06T10:00:00.000Z',
			updatedAt: '2026-04-06T10:00:00.000Z',
			attempts: 1,
			maxAttempts: 3,
			image: {
				publicUrl: 'https://example.com/receipt-4.jpg',
				filePath: '/tmp/receipt-4.jpg',
				fileName: 'receipt-4.jpg',
				size: 111,
			},
		});

		expect(mockedBaseTransactions.safeCreateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				date: '2026-04-06T15:00:00.000Z',
			})
		);
	});

	it('keeps dateTime unchanged when no timezone is provided and normalizes duplicate credit previews', async () => {
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-07',
			dateTime: '2026-04-07T08:30:00',
			description: 'Refund',
			amount: 15,
			category: 'Other',
			type: 'income',
			currency: 'USD',
			referenceId: 'dup-1',
			isDuplicate: true,
			beloWithdrawMatch: null,
			rawText: 'Refund',
			textLines: ['Refund'],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});
		mockedBaseTransactions.safeCreateTransaction.mockResolvedValue({
			transaction: {
				id: 52,
				date: new Date('2026-04-07T08:30:00.000Z'),
				description: null,
				amount: 15,
				currency: 'USD',
				type: 'credit',
				referenceId: null,
				category: null,
			},
			isDuplicate: true,
		} as never);

		const result = await processReceiptOcrJob({
			id: 'job-5',
			userId: 3,
			status: 'processing',
			reviewStatus: 'pending_review',
			reviewedAt: null,
			timeZone: null,
			createdAt: '2026-04-07T08:00:00.000Z',
			updatedAt: '2026-04-07T08:00:00.000Z',
			attempts: 1,
			maxAttempts: 3,
			image: {
				publicUrl: 'https://example.com/receipt-5.jpg',
				filePath: '/tmp/receipt-5.jpg',
				fileName: 'receipt-5.jpg',
				size: 111,
			},
		});

		expect(mockedBaseTransactions.safeCreateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				date: '2026-04-07T08:30:00',
				type: 'credit',
			})
		);
		expect(result.createdTransaction).toEqual({
			id: 52,
			date: '2026-04-07T08:30:00.000Z',
			description: 'Scanned receipt',
			amount: 15,
			currency: 'USD',
			category: 'Other',
			type: 'income',
			referenceId: null,
			isDuplicate: true,
		});
	});

	it('prefers the longest keyword match when multiple categories match', async () => {
		mockedPrisma.category.findMany.mockResolvedValue([
			{
				id: 31,
				name: 'Shopping',
				categoryKeyword: [{ keyword: { name: 'villa' } }],
			},
			{
				id: 32,
				name: 'Food & Dining',
				categoryKeyword: [{ keyword: { name: 'villa ortuzar' } }],
			},
		]);
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-08',
			dateTime: '2026-04-08T19:00:00',
			description: 'Dinner in Villa Ortuzar',
			amount: 25,
			category: 'Other',
			type: 'expense',
			currency: 'USD',
			referenceId: undefined,
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: 'Dinner in Villa Ortuzar',
			textLines: ['Dinner in Villa Ortuzar'],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		await processReceiptOcrJob({
			id: 'job-6',
			userId: 4,
			status: 'processing',
			reviewStatus: 'pending_review',
			reviewedAt: null,
			timeZone: 'America/Argentina/Buenos_Aires',
			createdAt: '2026-04-08T18:00:00.000Z',
			updatedAt: '2026-04-08T18:00:00.000Z',
			attempts: 1,
			maxAttempts: 3,
			image: {
				publicUrl: 'https://example.com/receipt-6.jpg',
				filePath: '/tmp/receipt-6.jpg',
				fileName: 'receipt-6.jpg',
				size: 222,
			},
		});

		expect(mockedBaseTransactions.safeCreateTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: 32 })
		);
	});

	it('throws when the receipt description is empty', async () => {
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-09',
			dateTime: '2026-04-09T10:00:00',
			description: '   ',
			amount: 10,
			category: 'Other',
			type: 'expense',
			currency: 'USD',
			referenceId: undefined,
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: '',
			textLines: [],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		await expect(
			processReceiptOcrJob({
				id: 'job-7',
				userId: 5,
				status: 'processing',
				reviewStatus: 'pending_review',
				reviewedAt: null,
				timeZone: null,
				createdAt: '2026-04-09T09:00:00.000Z',
				updatedAt: '2026-04-09T09:00:00.000Z',
				attempts: 1,
				maxAttempts: 3,
				image: {
					publicUrl: 'https://example.com/receipt-7.jpg',
					filePath: '/tmp/receipt-7.jpg',
					fileName: 'receipt-7.jpg',
					size: 50,
				},
			})
		).rejects.toThrow('Receipt description could not be extracted automatically');
	});

	it('throws when the receipt amount is invalid', async () => {
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-09',
			dateTime: '2026-04-09T10:00:00',
			description: 'Coffee',
			amount: 0,
			category: 'Other',
			type: 'expense',
			currency: 'USD',
			referenceId: undefined,
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: '',
			textLines: [],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		await expect(
			processReceiptOcrJob({
				id: 'job-8',
				userId: 5,
				status: 'processing',
				reviewStatus: 'pending_review',
				reviewedAt: null,
				timeZone: null,
				createdAt: '2026-04-09T09:00:00.000Z',
				updatedAt: '2026-04-09T09:00:00.000Z',
				attempts: 1,
				maxAttempts: 3,
				image: {
					publicUrl: 'https://example.com/receipt-8.jpg',
					filePath: '/tmp/receipt-8.jpg',
					fileName: 'receipt-8.jpg',
					size: 50,
				},
			})
		).rejects.toThrow('Receipt amount could not be extracted automatically');
	});

	it('throws when the receipt transaction type cannot be normalized', async () => {
		mockedAnalyzeReceiptImageForUser.mockResolvedValue({
			date: '2026-04-09',
			dateTime: '2026-04-09T10:00:00',
			description: 'Coffee',
			amount: 5,
			category: 'Other',
			type: 'mystery' as never,
			currency: 'USD',
			referenceId: undefined,
			isDuplicate: false,
			beloWithdrawMatch: null,
			rawText: '',
			textLines: [],
			requiresManualReview: false,
			parseWarning: null,
			metadataDateTimeSuggestion: null,
		});

		await expect(
			processReceiptOcrJob({
				id: 'job-9',
				userId: 5,
				status: 'processing',
				reviewStatus: 'pending_review',
				reviewedAt: null,
				timeZone: null,
				createdAt: '2026-04-09T09:00:00.000Z',
				updatedAt: '2026-04-09T09:00:00.000Z',
				attempts: 1,
				maxAttempts: 3,
				image: {
					publicUrl: 'https://example.com/receipt-9.jpg',
					filePath: '/tmp/receipt-9.jpg',
					fileName: 'receipt-9.jpg',
					size: 50,
				},
			})
		).rejects.toThrow('Receipt transaction type could not be normalized');
	});
});
