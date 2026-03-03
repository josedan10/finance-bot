import cron from 'node-cron';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus';
import { PrismaModule as prisma } from '../database/database.module';
import TelegramModule from '../telegram/telegram.module';
import { ScraperPydolarModule } from '../scraper-api-pydolar/scraper-api-pydolar.module';
import { ExchangeCurrencyCronServices } from './exchange-currency/exchange-currency.service';
import { GmailService } from '../gmail/gmail.module';
import { emailParser } from '../gmail/email-parser';
import dayjs from 'dayjs';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

const CRON_EXPRESSIONS = {
	createDailyTask: process.env.CRON_CREATE_DAILY_TASK || '0 10 * * 1-5',
	updateExchangeRate: process.env.CRON_UPDATE_EXCHANGE_RATE || '0 * * * 1-5',
	updateTransactionsTable: process.env.CRON_UPDATE_TRANSACTIONS || '0 9 * * 0-6',
	checkGmailEmails: process.env.CRON_CHECK_GMAIL || '0 */30 * * 1-5',
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

	start() {
		logger.info('Starting task queue module...', { cronExpressions: CRON_EXPRESSIONS });

		this.createDailyExchangeRateTask.start();
		this.startDailyExchangeRateMonitor.start();
		this.startDailyUpdateTransactionsTable.start();
		this.checkGmailSchedule.start();
	}

	private async _createDailyExchangeRateTask() {
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
	}

	private async _updateDailyExchangeRateFunction() {
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
					date: dayjs().startOf('day').toDate(),
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
	}

	private async _updateDailyTransactionsTable() {
		try {
			await ExchangeCurrencyCronServices.getAmountResult();
			logger.info('Transaction amounts in dollars are up to date');
		} catch (error) {
			logger.error('Error updating daily transactions table', { error });
		}
	}

	private async _checkGmailEmails() {
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
					const paymentMethod = await prisma.paymentMethod.findFirst({
						where: { name: { contains: parsed.paymentMethod } },
					});

					let category = null;
					if (parsed.category) {
						category = await prisma.category.findUnique({
							where: { name_userId: { name: parsed.category, userId: 1 } },
						});
					}

					await prisma.transaction.create({
						data: {
							date: email.date,
							description: parsed.description.slice(0, 255),
							amount: parsed.amount,
							currency: parsed.currency,
							type: parsed.type,
							referenceId: parsed.referenceId || null,
							user: { connect: { id: 1 } },
							...(paymentMethod && {
								paymentMethod: { connect: { id: paymentMethod.id } },
							}),
							...(category && {
								category: { connect: { id: category.id } },
							}),
						},
					});

					await prisma.processedEmail.create({
						data: {
							messageId: email.messageId,
							from: email.from.slice(0, 255),
							subject: email.subject.slice(0, 500),
							result: `registered:${ruleName}`,
						},
					});

					await GmailService.markAsRead(email.messageId);

					registered++;
					summaryLines.push(
						`  ${parsed.type === 'debit' ? '💸' : '💰'} ${parsed.amount} ${parsed.currency} - ${parsed.description} (${ruleName})`
					);

					logger.info('Transaction registered from email', {
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
			await TelegramModule.sendMessage(
				`❌ Gmail check error: ${errorMessage}`,
				config.TEST_CHAT_ID
			);
		}
	}
}

export const TaskQueueModuleService = new TaskQueueModule();
