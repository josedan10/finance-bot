import { randomUUID } from 'crypto';
import { config } from '../../src/config';
import { redisClient } from '../../src/lib/redis';
import logger from '../../src/lib/logger';

export type ReceiptOcrJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ReceiptOcrJobReviewStatus = 'pending_review' | 'reviewed' | 'dismissed';

export interface ReceiptOcrQueuedFile {
	publicUrl: string;
	filePath: string;
	fileName: string;
	originalName?: string;
	mimeType?: string;
	size: number;
	requestId?: string | null;
	timeZone?: string | null;
}

export interface ReceiptOcrQueueJob {
	id: string;
	userId: number;
	status: ReceiptOcrJobStatus;
	createdAt: string;
	updatedAt: string;
	attempts: number;
	maxAttempts: number;
	reviewStatus: ReceiptOcrJobReviewStatus;
	reviewedAt?: string | null;
	requestId?: string | null;
	timeZone?: string | null;
	image: {
		publicUrl: string;
		filePath: string;
		fileName: string;
		originalName?: string;
		mimeType?: string;
		size: number;
	};
	error?: string;
	result?: Record<string, unknown>;
}

const QUEUE_KEY = 'receipt:ocr:queue';
const JOB_KEY_PREFIX = 'receipt:ocr:job:';
const USER_JOBS_KEY_PREFIX = 'receipt:ocr:user:jobs:';
const USER_JOB_LIST_LIMIT = 200;

function getJobKey(jobId: string): string {
	return `${JOB_KEY_PREFIX}${jobId}`;
}

function getUserJobsKey(userId: number): string {
	return `${USER_JOBS_KEY_PREFIX}${userId}`;
}

function toJobSummary(job: ReceiptOcrQueueJob) {
	return {
		id: job.id,
		status: job.status,
		attempts: job.attempts,
		maxAttempts: job.maxAttempts,
		reviewStatus: job.reviewStatus,
		reviewedAt: job.reviewedAt || null,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
		requestId: job.requestId || null,
		timeZone: job.timeZone || null,
		image: {
			publicUrl: job.image.publicUrl,
			fileName: job.image.fileName,
			originalName: job.image.originalName || null,
			mimeType: job.image.mimeType || null,
			size: job.image.size,
		},
		error: job.error || null,
		result: job.result || null,
	};
}

class ReceiptOcrQueueServiceClass {
	private get jobTtlSeconds(): number {
		return config.RECEIPT_OCR_JOB_TTL_HOURS * 60 * 60;
	}

	async enqueueJobs(userId: number, files: ReceiptOcrQueuedFile[]): Promise<ReturnType<typeof toJobSummary>[]> {
		if (files.length === 0) {
			return [];
		}

		const client = await redisClient.getClient();
		const jobs: ReceiptOcrQueueJob[] = [];

		for (const file of files) {
			const now = new Date().toISOString();
			const id = randomUUID();
			const job: ReceiptOcrQueueJob = {
				id,
				userId,
				status: 'queued',
				createdAt: now,
				updatedAt: now,
				attempts: 0,
				maxAttempts: config.RECEIPT_OCR_JOB_MAX_ATTEMPTS,
				reviewStatus: 'pending_review',
				reviewedAt: null,
				requestId: file.requestId || null,
				timeZone: file.timeZone || null,
				image: {
					publicUrl: file.publicUrl,
					filePath: file.filePath,
					fileName: file.fileName,
					originalName: file.originalName,
					mimeType: file.mimeType,
					size: file.size,
				},
			};

			const raw = JSON.stringify(job);
			await client.set(getJobKey(id), raw, { EX: this.jobTtlSeconds });
			await client.rPush(QUEUE_KEY, id);
			await client.lPush(getUserJobsKey(userId), id);
			await client.lTrim(getUserJobsKey(userId), 0, USER_JOB_LIST_LIMIT - 1);
			await client.expire(getUserJobsKey(userId), this.jobTtlSeconds);
			jobs.push(job);
		}

		logger.info('Queued OCR jobs in Redis', {
			userId,
			count: jobs.length,
		});

		return jobs.map(toJobSummary);
	}

	async getJob(jobId: string): Promise<ReceiptOcrQueueJob | null> {
		const raw = await redisClient.get(getJobKey(jobId));
		if (!raw) {
			return null;
		}

		try {
			return JSON.parse(raw) as ReceiptOcrQueueJob;
		} catch (error) {
			logger.error('Failed to parse OCR job payload from Redis', { jobId, error });
			return null;
		}
	}

	private async saveJob(job: ReceiptOcrQueueJob): Promise<void> {
		job.updatedAt = new Date().toISOString();
		await redisClient.set(getJobKey(job.id), JSON.stringify(job), { EX: this.jobTtlSeconds });
	}

	async getJobsByIds(userId: number, jobIds: string[]): Promise<ReturnType<typeof toJobSummary>[]> {
		const jobs: ReturnType<typeof toJobSummary>[] = [];

		for (const jobId of jobIds) {
			const job = await this.getJob(jobId);
			if (!job || job.userId !== userId) {
				continue;
			}
			jobs.push(toJobSummary(job));
		}

		return jobs;
	}

	async listJobsForUser(userId: number, limit = 50): Promise<ReturnType<typeof toJobSummary>[]> {
		const client = await redisClient.getClient();
		const ids = await client.lRange(getUserJobsKey(userId), 0, Math.max(0, limit - 1));

		if (ids.length === 0) {
			return [];
		}

		return this.getJobsByIds(userId, ids);
	}

	async dequeueNextQueuedJob(): Promise<ReceiptOcrQueueJob | null> {
		const client = await redisClient.getClient();
		const nextJobId = await client.lPop(QUEUE_KEY);

		if (!nextJobId) {
			return null;
		}

		const job = await this.getJob(nextJobId);
		if (!job) {
			return null;
		}

		if (job.status !== 'queued') {
			return null;
		}

		job.status = 'processing';
		job.error = undefined;
		job.attempts += 1;
		await this.saveJob(job);
		return job;
	}

	async markCompleted(job: ReceiptOcrQueueJob, result: Record<string, unknown>): Promise<void> {
		job.status = 'completed';
		job.result = result;
		job.error = undefined;
		await this.saveJob(job);
	}

	async markFailed(job: ReceiptOcrQueueJob, errorMessage: string): Promise<void> {
		const shouldRetry = job.attempts < job.maxAttempts;

		job.status = shouldRetry ? 'queued' : 'failed';
		job.error = errorMessage;
		await this.saveJob(job);

		if (shouldRetry) {
			const client = await redisClient.getClient();
			await client.rPush(QUEUE_KEY, job.id);
		}
	}

	async retryJob(userId: number, jobId: string): Promise<ReturnType<typeof toJobSummary> | null> {
		const job = await this.getJob(jobId);
		if (!job || job.userId !== userId) {
			return null;
		}

		if (job.status === 'completed' || job.status === 'processing') {
			return toJobSummary(job);
		}

		job.status = 'queued';
		job.error = undefined;
		job.attempts = 0;
		await this.saveJob(job);

		const client = await redisClient.getClient();
		await client.rPush(QUEUE_KEY, job.id);
		return toJobSummary(job);
	}

	async markReviewed(
		userId: number,
		jobId: string,
		reviewStatus: ReceiptOcrJobReviewStatus
	): Promise<ReturnType<typeof toJobSummary> | null> {
		const job = await this.getJob(jobId);
		if (!job || job.userId !== userId) {
			return null;
		}

		job.reviewStatus = reviewStatus;
		job.reviewedAt = reviewStatus === 'reviewed' ? new Date().toISOString() : null;
		await this.saveJob(job);

		return toJobSummary(job);
	}
}

export const ReceiptOcrQueueService = new ReceiptOcrQueueServiceClass();
