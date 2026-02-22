import cron from 'node-cron';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus';
import { PrismaModule as prisma } from '../database/database.module';
import TelegramModule from '../telegram/telegram.module';
import { ScraperPydolarModule } from '../scraper-api-pydolar/scraper-api-pydolar.module';
import { ExchangeCurrencyCronServices } from './exchange-currency/exchange-currency.service';
import dayjs from 'dayjs';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';

const CRON_EXPRESSIONS = {
	createDailyTask: process.env.CRON_CREATE_DAILY_TASK || '0 10 * * 1-5',
	updateExchangeRate: process.env.CRON_UPDATE_EXCHANGE_RATE || '0 * * * 1-5',
	updateTransactionsTable: process.env.CRON_UPDATE_TRANSACTIONS || '0 9 * * 0-6',
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

	start() {
		logger.info('Starting task queue module...', { cronExpressions: CRON_EXPRESSIONS });

		this.createDailyExchangeRateTask.start();
		this.startDailyExchangeRateMonitor.start();
		this.startDailyUpdateTransactionsTable.start();
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
}

export const TaskQueueModuleService = new TaskQueueModule();
