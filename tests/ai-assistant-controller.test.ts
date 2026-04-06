import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { queueReceiptAnalysis } from '../controllers/ai-assistant/ai-assistant.controller';

type MockOptimizedReceiptImage = {
	buffer: Buffer;
	mimeType: string;
	compressionIterations: number;
	compressionQuality: number | null;
	targetMaxBytes: number | null;
	targetReached: boolean;
	originalBytes: number;
	optimizedBytes: number;
	originalWidth: number | null;
	originalHeight: number | null;
	optimizedWidth: number | null;
	optimizedHeight: number | null;
	originalFormat: string | null;
	optimizedFormat: string | null;
	didOptimize: boolean;
};

type MockStoredReceiptImage = {
	publicUrl: string;
	filePath: string;
	fileName: string;
};

type MockQueuedJobSummary = {
	id: string;
	status: string;
};

const enqueueJobsMock = jest.fn<(userId: number, files: unknown[]) => Promise<MockQueuedJobSummary[]>>();
const optimizeReceiptImageForOcrMock = jest.fn<(buffer: Buffer) => Promise<MockOptimizedReceiptImage>>();
const saveReceiptProcessingImageMock = jest.fn<
	(params: { requestId: string }) => Promise<MockStoredReceiptImage>
>();

jest.mock('../modules/ai-assistant/ai-assistant.module', () => ({
	AISettingsService: {},
	AIAssistantFactory: {},
}));

jest.mock('../modules/database/database.module', () => ({
	PrismaModule: {},
}));

jest.mock('../modules/ai-assistant/receipt-ocr-queue.service', () => ({
	ReceiptOcrQueueService: {
		enqueueJobs: enqueueJobsMock,
	},
}));

jest.mock('../src/lib/receipt-image-storage', () => ({
	getImageExtension: jest.fn(),
	optimizeReceiptImageForOcr: optimizeReceiptImageForOcrMock,
	saveReceiptProcessingImage: saveReceiptProcessingImageMock,
}));

jest.mock('../src/lib/sentry', () => ({
	captureException: jest.fn(),
}));

function createResponse() {
	const json = jest.fn();
	const status = jest.fn().mockReturnValue({ json });
	return {
		locals: { requestId: 'req-123' },
		status,
		json,
	} as unknown as Response;
}

describe('AI Assistant Controller', () => {
	beforeEach(() => {
		jest.clearAllMocks();

		optimizeReceiptImageForOcrMock.mockResolvedValue({
			buffer: Buffer.from('optimized'),
			mimeType: 'image/jpeg',
			compressionIterations: 0,
			compressionQuality: 85,
			targetMaxBytes: 300 * 1024,
			targetReached: true,
			originalBytes: 100,
			optimizedBytes: 80,
			originalWidth: 100,
			originalHeight: 100,
			optimizedWidth: 100,
			optimizedHeight: 100,
			originalFormat: 'jpeg',
			optimizedFormat: 'jpeg',
			didOptimize: true,
		});

		saveReceiptProcessingImageMock.mockImplementation(async ({ requestId }: { requestId: string }) => ({
			publicUrl: `https://api.zentra-app.pro/receipt-processing/${requestId}.jpg`,
			filePath: `/tmp/${requestId}.jpg`,
			fileName: `${requestId}.jpg`,
		}));

		enqueueJobsMock.mockResolvedValue([{ id: 'job-1', status: 'queued' }]);
	});

	it('preserves the uploaded original filename when queueing receipts', async () => {
		const req = {
			user: {
				id: 1,
				firebaseId: 'firebase-user-1',
				email: 'test@example.com',
				createdAt: new Date('2026-04-06T00:00:00.000Z'),
			},
			body: {},
			files: [
				{
					buffer: Buffer.from('original-image'),
					originalname: 'WhatsApp Image 2026-04-02 at 15.26.02.jpeg',
					mimetype: 'image/jpeg',
					size: 12345,
				},
			],
			get: (header: string) => {
				if (header === 'host') return 'api.zentra-app.pro';
				if (header === 'x-forwarded-proto') return 'https';
				return undefined;
			},
			protocol: 'https',
		} as unknown as Request;
		const res = createResponse();

		await queueReceiptAnalysis(req, res);

		expect(enqueueJobsMock).toHaveBeenCalledTimes(1);
		expect(enqueueJobsMock.mock.calls[0][1]).toEqual([
			expect.objectContaining({
				originalName: 'WhatsApp Image 2026-04-02 at 15.26.02.jpeg',
				fileName: 'req-123-1.jpg',
			}),
		]);
	});
});
