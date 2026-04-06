import { analyzeReceiptImageForUser } from './receipt-analysis.service';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { Image2TextService } from '../image-2-text/image-2-text.module';
import { PrismaModule as prisma } from '../database/database.module';
import { config } from '../../src/config';

jest.mock('../base-transactions/base-transactions.module', () => ({
	BaseTransactions: {
		parseTransactionFromText: jest.fn(),
		findDuplicate: jest.fn(),
	},
}));

jest.mock('../image-2-text/image-2-text.module', () => ({
	Image2TextService: {
		extractTextFromImages: jest.fn(),
		analyzeReceiptWithGemini: jest.fn(),
	},
}));

jest.mock('../database/database.module', () => ({
	PrismaModule: {
		transaction: {
			findMany: jest.fn(),
		},
		category: {
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
		category: {
			findMany: jest.Mock;
		};
	};
	const initialGoogleAiApiKey = config.GOOGLE_AI_API_KEY;

	beforeEach(() => {
		jest.clearAllMocks();
		mockedPrisma.transaction.findMany.mockResolvedValue([]);
		mockedPrisma.category.findMany.mockResolvedValue([]);
		config.GOOGLE_AI_API_KEY = initialGoogleAiApiKey;
	});

	afterAll(() => {
		config.GOOGLE_AI_API_KEY = initialGoogleAiApiKey;
	});

	it('returns parsed receipt data when OCR and parsing succeed', async () => {
		config.GOOGLE_AI_API_KEY = '';
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
		config.GOOGLE_AI_API_KEY = '';
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
		config.GOOGLE_AI_API_KEY = '';
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

	it('uses Gemini structured receipt analysis and falls back unknown categories to Other', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'Supermarket Purchase\nTotal 14.5',
			amount: 14.5,
			description: 'Supermarket purchase',
			dateTime: '2026-04-04T12:30:00',
			category: 'Unknown Category',
			currency: 'USD',
			type: 'expense',
			referenceId: 'ref-1',
		});
		mockedImage2Text.extractTextFromImages.mockResolvedValue([
			{
				text: 'ignored raw text',
				metadata: {},
			},
		]);
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-structured',
		});

		expect(result.requiresManualReview).toBe(false);
		expect(result.amount).toBe(14.5);
		expect(result.description).toBe('Supermarket purchase');
		expect(result.category).toBe('Other');
		expect(result.type).toBe('expense');
		expect(result.referenceId).toBe('ref-1');
		expect(result.rawText).toContain('Supermarket Purchase');
		expect(mockedBaseTransactions.parseTransactionFromText).not.toHaveBeenCalled();
		expect(mockedImage2Text.extractTextFromImages).not.toHaveBeenCalled();
		expect(mockedImage2Text.analyzeReceiptWithGemini).toHaveBeenCalledWith(
			{ type: 'image-source', value: 'https://example.com/r.jpg' },
			['Other', 'Food'],
			'req-structured'
		);
	});

	it('normalizes latin receipt date formats returned by Gemini', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'Supermarket Purchase\n04/03/2026 14:30',
			amount: 14.5,
			description: 'Supermarket purchase',
			dateTime: '04/03/2026 14:30',
			category: 'Food',
			currency: 'USD',
			type: 'expense',
			referenceId: 'ref-2',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-latin-date',
		});

		expect(result.date).toBe('2026-03-04');
		expect(result.dateTime).toBe('2026-03-04T14:30:00');
		expect(result.requiresManualReview).toBe(false);
		expect(mockedImage2Text.extractTextFromImages).not.toHaveBeenCalled();
	});

	it('prefers the settled USDC amount when the receipt includes both fiat and discounted crypto values', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'QR payment\n3,100 ARS\nWere discounted 2.17 USDC',
			amount: 3100,
			description: 'QR payment',
			dateTime: '2026-04-04T20:27:00',
			category: 'Food',
			currency: 'ARS',
			type: 'expense',
			referenceId: 'ref-3',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-usdc-amount',
		});

		expect(result.amount).toBe(2.17);
		expect(result.currency).toBe('USD');
		expect(result.dateTime).toBe('2026-04-04T20:27:00');
	});

	it('extracts the visible receipt date when Gemini misses dateTime but raw text includes an english timestamp', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'QR payment\nApril 2nd, 2026 at 2:07 am\nWere discounted 2.17 USDC',
			amount: 3100,
			description: 'QR payment',
			dateTime: null,
			category: 'Food',
			currency: 'ARS',
			type: 'expense',
			referenceId: 'ref-4',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-visible-date',
		});

		expect(result.date).toBe('2026-04-02');
		expect(result.dateTime).toBe('2026-04-02T02:07:00');
		expect(result.amount).toBe(2.17);
		expect(result.currency).toBe('USD');
		expect(result.requiresManualReview).toBe(false);
	});

	it('prefers stable settlement amounts even when the receipt lists the currency before the amount', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'QR payment\n3,100 ARS\nCharged to balance: USDT 2.17',
			amount: 3100,
			description: 'QR payment',
			dateTime: '2026-04-04T20:27:00',
			category: 'Food',
			currency: 'ARS',
			type: 'expense',
			referenceId: 'ref-5',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-usdt-amount',
		});

		expect(result.amount).toBe(2.17);
		expect(result.currency).toBe('USD');
		expect(result.dateTime).toBe('2026-04-04T20:27:00');
	});

	it('ignores exchange-rate lines and keeps the discounted stable amount', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'QR payment\nExchange rate 1 USD = 1430 ARS\nWere discounted 2.17 USDC',
			amount: 1430,
			description: 'QR payment',
			dateTime: '2026-04-04T20:27:00',
			category: 'Food',
			currency: 'ARS',
			type: 'expense',
			referenceId: 'ref-6',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-ignore-exchange-rate',
		});

		expect(result.amount).toBe(2.17);
		expect(result.currency).toBe('USD');
	});

	it('extracts the reference id from visible receipt text when Gemini misses it', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'QR payment\nOperation ID: ABC-12345-ZX\nWere discounted 2.17 USDC',
			amount: 2.17,
			description: 'QR payment',
			dateTime: '2026-04-04T20:27:00',
			category: 'Food',
			currency: 'USD',
			type: 'expense',
			referenceId: null,
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-reference-id',
		});

		expect(result.referenceId).toBe('ABC-12345-ZX');
		expect(result.amount).toBe(2.17);
	});

	it('prefers the discounted stable amount when the keyword and amount are split across adjacent lines', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'QR payment\nExchange rate\n1 USD\nWere discounted\n2.17 USDC',
			amount: 1,
			description: 'QR payment',
			dateTime: '2026-04-04T20:27:00',
			category: 'Food',
			currency: 'USD',
			type: 'expense',
			referenceId: 'ref-7',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-split-discounted-amount',
		});

		expect(result.amount).toBe(2.17);
		expect(result.currency).toBe('USD');
	});

	it('overrides an ARS structured amount when a visible discounted USD amount exists in raw text', async () => {
		config.GOOGLE_AI_API_KEY = 'test-google-key';
		mockedPrisma.category.findMany.mockResolvedValue([{ id: 9, name: 'Food' }]);
		mockedImage2Text.analyzeReceiptWithGemini.mockResolvedValue({
			rawText: 'Total 2.345,00 ARS\nSe descontaron USD 2.17\nQR payment to Cremolatti',
			amount: 2345,
			description: 'QR payment to Cremolatti',
			dateTime: '2026-04-04T20:27:00',
			category: 'Food',
			currency: 'ARS',
			type: 'expense',
			referenceId: 'ref-8',
		});
		mockedBaseTransactions.findDuplicate.mockResolvedValue(null);

		const result = await analyzeReceiptImageForUser({
			userId: 2,
			imageInput: { type: 'image-source', value: 'https://example.com/r.jpg' },
			requestId: 'req-prefer-usd-over-ars',
		});

		expect(result.amount).toBe(2.17);
		expect(result.currency).toBe('USD');
	});
});
