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
			create: jest.Mock;
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
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
});
