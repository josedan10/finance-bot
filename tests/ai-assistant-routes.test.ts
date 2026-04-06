import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import app from '../app';

const queueReceiptAnalysisMock = jest.fn(
	async (req: Request, res: Response): Promise<void> => {
		const files = req.files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
		const fileCount = Array.isArray(files)
			? files.length
			: files
				? Object.values(files).flat().length
				: req.file
					? 1
					: 0;

		res.status(200).json({ fileCount });
	}
);

jest.mock('../src/lib/auth.middleware', () => ({
	requireAuth: (req: Request, _res: Response, next: NextFunction) => {
		req.user = {
			id: 1,
			firebaseId: 'firebase-user-1',
			email: 'test@example.com',
			createdAt: new Date('2026-04-06T00:00:00.000Z'),
		};
		next();
	},
}));

jest.mock('../controllers/ai-assistant/ai-assistant.controller', () => ({
	getAISettings: jest.fn(),
	updateAISettings: jest.fn(),
	scanReceipt: jest.fn(),
	queueReceiptAnalysis: queueReceiptAnalysisMock,
	getQueuedReceiptAnalysisJobs: jest.fn(),
	retryQueuedReceiptAnalysisJob: jest.fn(),
	markQueuedReceiptAnalysisJobReviewed: jest.fn(),
	uploadReceiptSample: jest.fn(),
	analyzeTransactions: jest.fn(),
	getBudgetSuggestions: jest.fn(),
}));

describe('AI Assistant Routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('accepts bulk receipt uploads under the images field', async () => {
		const response = await request(app)
			.post('/api/ai/receipt-analysis/queue')
			.attach('images', Buffer.from('file-1'), { filename: 'one.jpg', contentType: 'image/jpeg' })
			.attach('images', Buffer.from('file-2'), { filename: 'two.jpg', contentType: 'image/jpeg' });

		expect(response.status).toBe(200);
		expect(response.body.fileCount).toBe(2);
		expect(queueReceiptAnalysisMock).toHaveBeenCalledTimes(1);
	});

	it('accepts a single queued receipt upload under the legacy image field', async () => {
		const response = await request(app)
			.post('/api/ai/receipt-analysis/queue')
			.attach('image', Buffer.from('file-1'), { filename: 'one.jpg', contentType: 'image/jpeg' });

		expect(response.status).toBe(200);
		expect(response.body.fileCount).toBe(1);
		expect(queueReceiptAnalysisMock).toHaveBeenCalledTimes(1);
	});

	it('accepts multiple queued receipt uploads under the legacy image field', async () => {
		const response = await request(app)
			.post('/api/ai/receipt-analysis/queue')
			.attach('image', Buffer.from('file-1'), { filename: 'one.jpg', contentType: 'image/jpeg' })
			.attach('image', Buffer.from('file-2'), { filename: 'two.jpg', contentType: 'image/jpeg' });

		expect(response.status).toBe(200);
		expect(response.body.fileCount).toBe(2);
		expect(queueReceiptAnalysisMock).toHaveBeenCalledTimes(1);
	});
});
