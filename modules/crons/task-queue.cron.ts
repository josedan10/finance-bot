import cron from 'node-cron';
import { randomUUID } from 'crypto';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus';
import { PrismaModule as prisma } from '../database/database.module';
import TelegramModule from '../telegram/telegram.module';
import { ScraperPydolarModule } from '../scraper-api-pydolar/scraper-api-pydolar.module';
import { ExchangeCurrencyCronServices } from './exchange-currency/exchange-currency.service';
import { GmailService } from '../gmail/gmail.module';
import { emailParser } from '../gmail/email-parser';
import { BaseTransactions } from '../base-transactions/base-transactions.module';
import { normalizeTransactionType } from '../../src/lib/transaction-type';
import dayjs from 'dayjs';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';
import { redisClient } from '../../src/lib/redis';
import { cleanupOldReceiptProcessingImages } from '../../src/lib/receipt-image-storage';
import { ReceiptOcrQueueService } from '../ai-assistant/receipt-ocr-queue.service';
import { processReceiptOcrJob } from '../ai-assistant/receipt-ocr-job-processor.service';
import { fetchAndStoreArsUsdRateByDate } from '../../src/helpers/rate.helper';

const CRON_EXPRESSIONS = {
	createDailyTask: process.env.CRON_CREATE_DAILY_TASK || '0 10,16 * * 1-5',
	updateExchangeRate: process.env.CRON_UPDATE_EXCHANGE_RATE || '0 * * * 1-5',
	updateTransactionsTable: process.env.CRON_UPDATE_TRANSACTIONS || '0 9 * * 0-6',
	checkGmailEmails: process.env.CRON_CHECK_GMAIL || '0 */30 * * 1-5',
	cleanupReceiptProcessingImages: process.env.CRON_CLEAN_RECEIPT_PROCESSING_IMAGES || '0 * * * *',
	processReceiptOcrQueue: process.env.CRON_PROCESS_RECEIPT_OCR_QUEUE || '*/10 * * * * *',
	syncArsUsdRate: process.env.CRON_SYNC_ARS_USD_RATE || '0 0,12 * * *',
};

export class TaskQueueModule {
	private startDailyExchangeRateMonitor = cron.schedule(
		CRON_EXPRESSIONS.updateExchangeRate,
		this._updateDailyExchangeRateFunction.bind(this),
		{ timezone: config.CRON_TIMEZONE }
	);

	private createDailyExchangeRateTask = cron.schedule(
		CRON_EXPRESSIONS.createDailyTask,
		this._createDailyExchangeRateTask.bind(this),
		{ timezone: config.CRON_TIMEZONE, scheduled: true }
	);

	private startDailyUpdateTransactionsTable = cron.schedule(
		CRON_EXPRESSIONS.updateTransactionsTable,
		this._updateDailyTransactionsTable.bind(this),
		{ timezone: config.CRON_TIMEZONE, scheduled: true }
	);

	private checkGmailSchedule = cron.schedule(
		CRON_EXPRESSIONS.checkGmailEmails,
		this._checkGmailEmails.bind(this),
		{ timezone: config.CRON_TIMEZONE, scheduled: true }
	);

	private cleanupReceiptProcessingImages = cron.schedule(
		CRON_EXPRESSIONS.cleanupReceiptProcessingImages,
		this._cleanupReceiptProcessingImages.bind(this),
		{ timezone: config.CRON_TIMEZONE, scheduled: true }
	);

	private processReceiptOcrQueue = cron.schedule(
		CRON_EXPRESSIONS.processReceiptOcrQueue,
		this._processReceiptOcrQueue.bind(this),
		{ timezone: config.CRON_TIMEZONE, scheduled: true }
	);

	private syncArsUsdRate = cron.schedule(CRON_EXPRESSIONS.syncArsUsdRate, this._syncArsUsdRate.bind(this), {
		timezone: config.CRON_TIMEZONE,
		scheduled: true,
	});

	private isProcessingReceiptQueue = false;

	private async withCronLock<T>(lockName: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | null> {
		const lockKey = `lock:cron:${lockName}`;
		const lockToken = randomUUID();
		const acquired = await redisClient.set(lockKey, lockToken, { EX: ttlSeconds, NX: true });

		if (acquired !== 'OK') {
			logger.info('Skipping cron execution because another instance holds the lock', { lockKey });
			return null;
		}

		try {
			return await fn();
		} finally {
			const currentToken = await redisClient.get(lockKey);
			if (currentToken === lockToken) {
				await redisClient.del(lockKey);
			}
		}
	}

	start() {
		logger.info('Starting task queue module...', { cronExpressions: CRON_EXPRESSIONS });

		this.createDailyExchangeRateTask.start();
		this.startDailyExchangeRateMonitor.start();
		this.startDailyUpdateTransactionsTable.start();
		this.checkGmailSchedule.start();
		this.cleanupReceiptProcessingImages.start();
		this.processReceiptOcrQueue.start();
		this.syncArsUsdRate.start();
	}

	private async _createDailyExchangeRateTask() {
		await this.withCronLock('createDailyExchangeRateTask', 600, async () => {
			try {
				logger.info('Creating daily exchange rate task...');
				await prisma.taskQueue.create({
					data: {
						type: TASK_TYPE.DAILY_UPDATE_EXCHANGE_RATE,
						status: TASK_STATUS.PENDING,
						createdBy: 'system',
					},
				});
			} catch (error) {
				logger.error('Error creating daily exchange rate task', { error });
			}
		});
	}

	private async _updateDailyExchangeRateFunction() {
		await this.withCronLock('updateDailyExchangeRate', 900, async () => {
			let getExistingTask;
			logger.info('Running cron job to get daily exchange rate...');

			try {
				getExistingTask = await prisma.taskQueue.findFirst({
					where: {
						type: TASK_TYPE.DAILY_UPDATE_EXCHANGE_RATE,
						status: TASK_STATUS.PENDING,
					},
				});
			} catch (error: unknown) {
				const errorResponse = error as Error;
				logger.error('Error getting daily exchange rate task', { error });
				TelegramModule.sendMessage(
					`Error getting daily exchange rate task. \n\n${errorResponse.message}`,
					config.TEST_CHAT_ID
				);
				return;
			}

			if (!getExistingTask) {
				logger.info('No pending task found');
				return;
			}

			try {
				const prices = await ScraperPydolarModule.getPricesData();

				await prisma.taskQueue.update({
					where: {
						id: getExistingTask.id,
					},
					data: {
						status: TASK_STATUS.COMPLETED,
						completedAt: new Date(),
					},
				});

				await TelegramModule.sendMessage(
					`Daily exchange rate completed. \n\nMonitor Rate: ${prices.monitor} \nBCV Rate: ${prices.bcv}`,
					config.TEST_CHAT_ID
				);
				logger.info('Cron job to get daily exchange rate completed');

				await prisma.dailyExchangeRate.create({
					data: {
						monitorPrice: Number(prices.monitor),
						bcvPrice: Number(prices.bcv),
						date: new Date(),
					},
				});
			} catch (error: unknown) {
				const errorResponse = error as Error;
				logger.error('Error checking daily exchange rate function', { error: errorResponse.message });

				if (getExistingTask) {
					await prisma.taskQueue.update({
						where: {
							id: getExistingTask.id,
						},
						data: {
							status: getExistingTask.attemptsRemaining > 0 ? TASK_STATUS.PENDING : TASK_STATUS.ERROR,
							attemptsRemaining: getExistingTask.attemptsRemaining - 1,
						},
					});
				}

				await TelegramModule.sendMessage(
					`Error checking daily exchange rate function. \n\n${errorResponse.message}`,
					config.TEST_CHAT_ID
				);
			}
		});
	}

	private async _updateDailyTransactionsTable() {
		await this.withCronLock('updateDailyTransactionsTable', 1800, async () => {
			try {
				await ExchangeCurrencyCronServices.getAmountResult();
				logger.info('Transaction amounts in dollars are up to date');
			} catch (error) {
				logger.error('Error updating daily transactions table', { error });
			}
		});
	}

	private async _syncArsUsdRate() {
		await this.withCronLock('syncArsUsdRate', 900, async () => {
			try {
				const storedRate = await fetchAndStoreArsUsdRateByDate(new Date(), config.ARS_USD_EXCHANGE_HOUSE);
				logger.info('ARS/USD historical rate synced', {
					house: config.ARS_USD_EXCHANGE_HOUSE,
					date: dayjs(storedRate.rateDate).format('YYYY-MM-DD'),
					sellPrice: Number(storedRate.sellPrice ?? 0),
				});
			} catch (error) {
				logger.error('Failed to sync ARS/USD rate', {
					error,
					house: config.ARS_USD_EXCHANGE_HOUSE,
				});
			}
		});
	}

	private async _checkGmailEmails() {
		await this.withCronLock('checkGmailEmails', 1800, async () => {
			logger.info('Running Gmail email check...');

			try {
				const emails = await GmailService.getUnreadEmails();

				if (emails.length === 0) {
					logger.info('No new emails to process');
					return;
				}

				const results = emailParser.parseEmails(emails);
				let registered = 0;
				let skipped = 0;
				let failed = 0;
				const summaryLines: string[] = [];

				for (const result of results) {
					const { email, parsed, ruleName } = result;

					const alreadyProcessed = await prisma.processedEmail.findUnique({
						where: { messageId: email.messageId },
					});

					if (alreadyProcessed) {
						logger.info('Email already processed, skipping', { messageId: email.messageId });
						skipped++;
						continue;
					}

					if (!parsed) {
						await prisma.processedEmail.create({
							data: {
								messageId: email.messageId,
								from: email.from.slice(0, 255),
								subject: email.subject.slice(0, 500),
								result: 'no_match',
							},
						});
						await GmailService.markAsRead(email.messageId);
						skipped++;
						continue;
					}

					try {
						const userEmailMatch = await prisma.user.findFirst({
							where: { email: email.from.toLowerCase() },
						});
						const targetUserId = userEmailMatch?.id || 1;

						const paymentMethod = await prisma.paymentMethod.findFirst({
							where: {
								name: { contains: parsed.paymentMethod },
								userId: targetUserId,
							},
						});

						let category = null;
						if (parsed.category) {
							category = await prisma.category.findUnique({
								where: { name_userId: { name: parsed.category, userId: targetUserId } },
							});
						}

						const { isDuplicate } = await BaseTransactions.safeCreateTransaction({
							userId: targetUserId,
							date: email.date,
							description: parsed.description.slice(0, 255),
							amount: parsed.amount,
							currency: parsed.currency,
							type: parsed.type,
							referenceId: parsed.referenceId || null,
							paymentMethodId: paymentMethod?.id,
							categoryId: category?.id,
						});

						await prisma.processedEmail.create({
							data: {
								messageId: email.messageId,
								from: email.from.slice(0, 255),
								subject: email.subject.slice(0, 500),
								result: isDuplicate ? `skipped:duplicate:${ruleName}` : `registered:${ruleName}`,
							},
						});

						await GmailService.markAsRead(email.messageId);

						if (!isDuplicate) {
							registered++;
							summaryLines.push(
								`  ${normalizeTransactionType(parsed.type) === 'expense' ? '💸' : '💰'} ${parsed.amount} ${parsed.currency} - ${parsed.description} (${ruleName})`
							);
						} else {
							skipped++;
						}

						logger.info(isDuplicate ? 'Transaction skipped (duplicate)' : 'Transaction registered from email', {
							messageId: email.messageId,
							amount: parsed.amount,
							currency: parsed.currency,
							rule: ruleName,
						});
					} catch (error) {
						logger.error('Error registering transaction from email', {
							messageId: email.messageId,
							error,
						});
						failed++;
					}
				}

				const summary = [
					`📧 Gmail check complete: ${emails.length} emails scanned`,
					`✅ ${registered} transactions registered`,
					skipped > 0 ? `⏭️ ${skipped} skipped (already processed or no match)` : '',
					failed > 0 ? `❌ ${failed} failed` : '',
					...summaryLines,
				]
					.filter(Boolean)
					.join('\n');

				await TelegramModule.sendMessage(summary, config.TEST_CHAT_ID);
				logger.info('Gmail check completed', { registered, skipped, failed });
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				logger.error('Error in Gmail cron job', { error: errorMessage });
				await TelegramModule.sendMessage(`❌ Gmail check error: ${errorMessage}`, config.TEST_CHAT_ID);
			}
		});
	}

	private async _cleanupReceiptProcessingImages() {
		await this.withCronLock('cleanupReceiptProcessingImages', 900, async () => {
			try {
				const result = await cleanupOldReceiptProcessingImages(config.RECEIPT_PROCESSING_TTL_HOURS);
				logger.info('Receipt processing image cleanup completed', {
					deletedCount: result.deletedCount,
					maxAgeHours: config.RECEIPT_PROCESSING_TTL_HOURS,
				});
			} catch (error) {
				logger.error('Error cleaning receipt processing images', { error });
			}
		});
	}

	private async _processReceiptOcrQueue() {
		await this.withCronLock('processReceiptOcrQueue', 300, async () => {
			if (this.isProcessingReceiptQueue) {
				return;
			}

			this.isProcessingReceiptQueue = true;

			try {
				let processedCount = 0;
				while (processedCount < config.RECEIPT_OCR_QUEUE_BATCH_SIZE) {
					const job = await ReceiptOcrQueueService.dequeueNextQueuedJob();
					if (!job) {
						break;
					}

					try {
						const result = await processReceiptOcrJob(job);
						await ReceiptOcrQueueService.markCompleted(job, result as unknown as Record<string, unknown>);
					} catch (error) {
						const message = error instanceof Error ? error.message : 'Unexpected OCR queue processing error';
						await ReceiptOcrQueueService.markFailed(job, message);
						logger.warn('Queued receipt OCR processing failed', {
							jobId: job.id,
							userId: job.userId,
							attempts: job.attempts,
							maxAttempts: job.maxAttempts,
							error: message,
						});
					}

					processedCount += 1;
				}
			} catch (error) {
				logger.error('Error processing queued receipt OCR jobs', { error });
			} finally {
				this.isProcessingReceiptQueue = false;
			}
		});
	}
}

export const TaskQueueModuleService = new TaskQueueModule();
