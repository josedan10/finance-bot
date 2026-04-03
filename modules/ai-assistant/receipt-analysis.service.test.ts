import { analyzeReceiptImageForUser } from './receipt-analysis.service';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { Image2TextService } from '../image-2-text/image-2-text.module';
import { PrismaModule as prisma } from '../database/database.module';

jest.mock('../base-transactions/base-transactions.module', () => ({
	BaseTransactions: {
		parseTransactionFromText: jest.fn(),
		findDuplicate: jest.fn(),
	},
}));

jest.mock('../image-2-text/image-2-text.module', () => ({
	Image2TextService: {
		extractTextFromImages: jest.fn(),
	},
}));

jest.mock('../database/database.module', () => ({
	PrismaModule: {
		transaction: {
			findMany: jest.fn(),
		},
	},
}));

describe('receipt-analysis.service', () => {
	const mockedImage2Text = Image2TextService as jest.Mocked<typeof Image2TextService>;
	const mockedBaseTransactions = BaseTransactions as jest.Mocked<typeof BaseTransactions>;
	const mockedPrisma = prisma as unknown as {
		transaction: {
			findMany: jest.Mock;
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockedPrisma.transaction.findMany.mockResolvedValue([]);
	});

	it('returns parsed receipt data when OCR and parsing succeed', async () => {
		mockedImage2Text.extractTextFromImages.mockResolvedValue([
			{
				text: 'Store ABC\nTotal 25',
				metadata: {
					capturedAt: '2026:04:03 10:10:00',
					deviceMake: 'Google',
					deviceModel: 'Pixel',
				},
			},
		]);
		mockedBaseTransactions.parseTransactionFromText.mockResolvedValue({
			date: '2026-04-03',
			amount: 25,
			originalAmount: 25,
			currency: 'USD',
			description: 'Store ABC',
			category: 'Food',
			categoryId: 1,
			type: 'debit',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue({ id: 77 } as unknown as Awaited<
			ReturnType<typeof BaseTransactions.findDuplicate>
		>);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-1',
		});

		expect(result.requiresManualReview).toBe(false);
		expect(result.isDuplicate).toBe(true);
		expect(result.duplicateId).toBe(77);
		expect(result.description).toBe('Store ABC');
		expect(result.category).toBe('Food');
		expect(result.amount).toBe(25);
		expect(result.type).toBe('expense');
		expect(result.metadataDateTimeSuggestion).toBe('2026-04-03T10:10');
		expect(mockedImage2Text.extractTextFromImages).toHaveBeenCalledWith(
			[{ type: 'image-source', value: 'https://example.com/r.jpg' }],
			'req-1'
		);
	});

	it('falls back to manual review data when parsing fails', async () => {
		mockedImage2Text.extractTextFromImages.mockResolvedValue([
			{
				text: 'Unknown Receipt Content',
				metadata: {
					capturedAt: 'invalid-date',
				},
			},
		]);
		mockedBaseTransactions.parseTransactionFromText.mockRejectedValue(new Error('parse failed'));

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-2',
		});

		expect(result.requiresManualReview).toBe(true);
		expect(result.parseWarning).toContain('parse failed');
		expect(result.amount).toBe(0);
		expect(result.category).toBe('Other');
		expect(result.type).toBe('expense');
		expect(result.metadataDateTimeSuggestion).toBeNull();
	});

	it('matches belo withdraw candidate when parsing succeeds', async () => {
		mockedImage2Text.extractTextFromImages.mockResolvedValue([
			{
				text: 'Belo receipt',
				metadata: {},
			},
		]);
		mockedBaseTransactions.parseTransactionFromText.mockResolvedValue({
			date: '2026-04-03',
			amount: 96,
			originalAmount: 96,
			currency: 'USD',
			description: 'Belo withdrawal',
			category: 'Transfers',
			categoryId: 1,
			type: 'debit',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);
		mockedPrisma.transaction.findMany.mockResolvedValue([
			{
				id: 10,
				description: 'withdraw to belo',
				date: new Date('2026-04-03T12:00:00.000Z'),
				amount: 100,
			},
		]);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
		});

		expect(result.beloWithdrawMatch).toBeTruthy();
		expect(result.beloWithdrawMatch?.id).toBe(10);
		expect(result.beloWithdrawMatch?.grossAmount).toBe(100);
	});
});
