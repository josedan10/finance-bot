import { ReceiptOcrQueueService, type ReceiptOcrQueueJob } from './receipt-ocr-queue.service';
import { redisClient } from '../../src/lib/redis';

describe('receipt-ocr-queue.service', () => {
	const mockRedisOps = {
		set: jest.fn(),
		rPush: jest.fn(),
		lPush: jest.fn(),
		lTrim: jest.fn(),
		expire: jest.fn(),
		lRange: jest.fn(),
		lPop: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(redisClient, 'getClient').mockResolvedValue(mockRedisOps as unknown as Awaited<ReturnType<typeof redisClient.getClient>>);
		jest.spyOn(redisClient, 'get').mockResolvedValue(null);
		jest.spyOn(redisClient, 'set').mockResolvedValue('OK');
	});

	it('enqueues jobs and returns summaries', async () => {
		const jobs = await ReceiptOcrQueueService.enqueueJobs(5, [
			{
				publicUrl: 'https://example.com/receipt-1.jpg',
				filePath: '/tmp/r1.jpg',
				fileName: 'r1.jpg',
				originalName: 'receipt.jpg',
				mimeType: 'image/jpeg',
				size: 100,
				requestId: 'req-1',
			},
			{
				publicUrl: 'https://example.com/receipt-2.jpg',
				filePath: '/tmp/r2.jpg',
				fileName: 'r2.jpg',
				originalName: 'receipt2.jpg',
				mimeType: 'image/jpeg',
				size: 110,
				requestId: 'req-2',
			},
		]);

		expect(jobs).toHaveLength(2);
		expect(jobs[0].status).toBe('queued');
		expect(jobs[0].reviewStatus).toBe('pending_review');
		expect(jobs[0].image.publicUrl).toContain('receipt-1.jpg');
		expect(mockRedisOps.rPush).toHaveBeenCalledTimes(2);
		expect(mockRedisOps.lPush).toHaveBeenCalledTimes(2);
	});

	it('returns empty array when enqueue receives no files', async () => {
		const jobs = await ReceiptOcrQueueService.enqueueJobs(1, []);
		expect(jobs).toEqual([]);
	});

	it('returns null when getJob payload is missing or invalid', async () => {
		(redisClient.get as jest.Mock).mockResolvedValueOnce(null);
		const missingJob = await ReceiptOcrQueueService.getJob('abc');
		expect(missingJob).toBeNull();

		(redisClient.get as jest.Mock).mockResolvedValueOnce('invalid-json');
		const invalidJob = await ReceiptOcrQueueService.getJob('abc');
		expect(invalidJob).toBeNull();
	});

	it('dequeues next queued job and marks it processing', async () => {
		mockRedisOps.lPop.mockResolvedValueOnce('job-1');
		const queuedJob = {
			id: 'job-1',
			userId: 5,
			status: 'queued',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			attempts: 0,
			maxAttempts: 2,
			reviewStatus: 'pending_review' as const,
			reviewedAt: null,
			requestId: 'req-1',
			image: {
				publicUrl: 'https://example.com/r.jpg',
				filePath: '/tmp/r.jpg',
				fileName: 'r.jpg',
				size: 100,
			},
		};

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(queuedJob));
		const job = await ReceiptOcrQueueService.dequeueNextQueuedJob();

		expect(job).toBeTruthy();
		expect(job?.status).toBe('processing');
		expect(job?.attempts).toBe(1);
		expect(redisClient.set).toHaveBeenCalled();
	});

	it('returns null when queue pop is empty, missing, or not queued status', async () => {
		mockRedisOps.lPop.mockResolvedValueOnce(null);
		const emptyPop = await ReceiptOcrQueueService.dequeueNextQueuedJob();
		expect(emptyPop).toBeNull();

		mockRedisOps.lPop.mockResolvedValueOnce('job-missing');
		(redisClient.get as jest.Mock).mockResolvedValueOnce(null);
		const missingJob = await ReceiptOcrQueueService.dequeueNextQueuedJob();
		expect(missingJob).toBeNull();

		mockRedisOps.lPop.mockResolvedValueOnce('job-processing');
		(redisClient.get as jest.Mock).mockResolvedValueOnce(
			JSON.stringify({
				id: 'job-processing',
				userId: 1,
				status: 'processing',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				attempts: 1,
				maxAttempts: 2,
				reviewStatus: 'pending_review' as const,
				reviewedAt: null,
				image: {
					publicUrl: 'u',
					filePath: 'p',
					fileName: 'f',
					size: 1,
				},
			})
		);
		const processingJob = await ReceiptOcrQueueService.dequeueNextQueuedJob();
		expect(processingJob).toBeNull();
	});

	it('lists jobs by ids and by user list', async () => {
		const job1 = {
			id: 'job-1',
			userId: 5,
			status: 'queued',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			attempts: 0,
			maxAttempts: 2,
			reviewStatus: 'pending_review' as const,
			reviewedAt: null,
			image: {
				publicUrl: 'u1',
				filePath: 'p1',
				fileName: 'f1',
				size: 1,
			},
		};
		const job2 = { ...job1, id: 'job-2', userId: 6 };

		(redisClient.get as jest.Mock)
			.mockResolvedValueOnce(JSON.stringify(job1))
			.mockResolvedValueOnce(JSON.stringify(job2));
		const byIds = await ReceiptOcrQueueService.getJobsByIds(5, ['job-1', 'job-2']);
		expect(byIds).toHaveLength(1);
		expect(byIds[0].id).toBe('job-1');

		mockRedisOps.lRange.mockResolvedValueOnce([]);
		const emptyList = await ReceiptOcrQueueService.listJobsForUser(5, 20);
		expect(emptyList).toEqual([]);

		mockRedisOps.lRange.mockResolvedValueOnce(['job-1']);
		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(job1));
		const listed = await ReceiptOcrQueueService.listJobsForUser(5, 20);
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe('job-1');
	});

	it('marks completed jobs with result payload', async () => {
		const job: ReceiptOcrQueueJob = {
			id: 'job-complete',
			userId: 5,
			status: 'processing',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			attempts: 1,
			maxAttempts: 2,
			reviewStatus: 'pending_review' as const,
			reviewedAt: null,
			image: {
				publicUrl: 'u',
				filePath: 'p',
				fileName: 'f',
				size: 1,
			},
		};

		await ReceiptOcrQueueService.markCompleted(job, { amount: 10 });
		expect(job.status).toBe('completed');
		expect(job.result).toEqual({ amount: 10 });
		expect(redisClient.set).toHaveBeenCalled();
	});

	it('marks failed jobs and requeues only when attempts remain', async () => {
		const retryableJob: ReceiptOcrQueueJob = {
			id: 'job-retry',
			userId: 5,
			status: 'processing' as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			attempts: 1,
			maxAttempts: 2,
			reviewStatus: 'pending_review',
			reviewedAt: null,
			image: {
				publicUrl: 'https://example.com/r.jpg',
				filePath: '/tmp/r.jpg',
				fileName: 'r.jpg',
				size: 100,
			},
		};

		await ReceiptOcrQueueService.markFailed(retryableJob, 'temporary error');
		expect(retryableJob.status).toBe('queued');
		expect(mockRedisOps.rPush).toHaveBeenCalledWith('receipt:ocr:queue', 'job-retry');

		const terminalJob: ReceiptOcrQueueJob = {
			...retryableJob,
			id: 'job-terminal',
			attempts: 2,
			maxAttempts: 2,
		};
		mockRedisOps.rPush.mockClear();
		await ReceiptOcrQueueService.markFailed(terminalJob, 'terminal error');
		expect(terminalJob.status).toBe('failed');
		expect(mockRedisOps.rPush).not.toHaveBeenCalled();
	});

	it('retries job only for matching user and non-completed status', async () => {
		const baseJob = {
			id: 'job-1',
			userId: 5,
			status: 'failed' as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			attempts: 2,
			maxAttempts: 2,
			reviewStatus: 'pending_review' as const,
			reviewedAt: null,
			image: {
				publicUrl: 'https://example.com/r.jpg',
				filePath: '/tmp/r.jpg',
				fileName: 'r.jpg',
				size: 100,
			},
		};
		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(baseJob));

		const retried = await ReceiptOcrQueueService.retryJob(5, 'job-1');
		expect(retried?.status).toBe('queued');
		expect(mockRedisOps.rPush).toHaveBeenCalledWith('receipt:ocr:queue', 'job-1');

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ ...baseJob, userId: 6 }));
		const unauthorizedRetry = await ReceiptOcrQueueService.retryJob(5, 'job-1');
		expect(unauthorizedRetry).toBeNull();

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ ...baseJob, status: 'completed' }));
		const completedRetry = await ReceiptOcrQueueService.retryJob(5, 'job-1');
		expect(completedRetry?.status).toBe('completed');

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ ...baseJob, status: 'processing' }));
		const processingRetry = await ReceiptOcrQueueService.retryJob(5, 'job-1');
		expect(processingRetry?.status).toBe('processing');
	});

	it('marks review status only for matching user jobs', async () => {
		const baseJob = {
			id: 'job-review',
			userId: 5,
			status: 'completed',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			attempts: 1,
			maxAttempts: 2,
			reviewStatus: 'pending_review' as const,
			reviewedAt: null,
			image: {
				publicUrl: 'https://example.com/r.jpg',
				filePath: '/tmp/r.jpg',
				fileName: 'r.jpg',
				size: 100,
			},
		};

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(baseJob));
		const reviewed = await ReceiptOcrQueueService.markReviewed(5, 'job-review', 'reviewed');
		expect(reviewed?.reviewStatus).toBe('reviewed');
		expect(reviewed?.reviewedAt).toBeTruthy();

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(baseJob));
		const dismissed = await ReceiptOcrQueueService.markReviewed(5, 'job-review', 'dismissed');
		expect(dismissed?.reviewStatus).toBe('dismissed');
		expect(dismissed?.reviewedAt).toBeNull();

		(redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify({ ...baseJob, userId: 6 }));
		const unauthorized = await ReceiptOcrQueueService.markReviewed(5, 'job-review', 'reviewed');
		expect(unauthorized).toBeNull();
	});
});
