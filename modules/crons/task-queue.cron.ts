import cron from 'node-cron';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus';
import { PrismaModule as prisma } from '../database/database.module';
import TelegramModule from '../telegram/telegram.module';
import { ScraperPydolarModule } from '../scraper-api-pydolar/scraper-api-pydolar.module';
import { ExchangeCurrencyCronServices } from './exchange-currency/exchange-currency.service';
import dayjs from 'dayjs';
import { config } from '../../src/config';

// once per hour
// const dailyUpdateExchangeRateTaskCronExpression = '0 * * * 1-5';

// once per day
const createDailyTaskCronExpression = '0 10 * * 1-5';
const dailyUpdateTransactionsTableCronExpression = '0 9 * * 0-6';

// TEST CRON EXPRESSIONS
// run every 10 minutes
const dailyUpdateExchangeRateTaskCronExpression = '0 */10 * * * *';

// run every 30 seconds
// const dailyUpdateExchangeRateTaskCronExpression = '*/30 * * * * *';

// run every 30 minutes
// const createDailyTaskCronExpression = '0 */30 * * * *';

export class TaskQueueModule {
	private startDailyExchangeRateMonitor = cron.schedule(
		dailyUpdateExchangeRateTaskCronExpression,
		this._updateDailyExchangeRateFunction.bind(this),
		{
			timezone: 'America/Caracas',
		}
	);

	private createDailyExchangeRateTask = cron.schedule(
		createDailyTaskCronExpression,
		this._createDailyExchangeRateTask.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	private startDailyUpdateTransactionsTable = cron.schedule(
		dailyUpdateTransactionsTableCronExpression,
		this._updateDailyTransactionsTable.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	start() {
		console.log('Starting task queue module...');

		this.createDailyExchangeRateTask.start();
		this.startDailyExchangeRateMonitor.start();
		this.startDailyUpdateTransactionsTable.start();
	}

	private async _createDailyExchangeRateTask() {
		try {
			console.log('Creating daily exchange rate task...');
			await prisma.taskQueue.create({
				data: {
					type: TASK_TYPE.DAILY_UPDATE_EXCHANGE_RATE,
					status: TASK_STATUS.PENDING,
					createdBy: 'system',
				},
			});
		} catch (error) {
			console.log('Error creating daily exchange rate task', error);
		}
	}

	private async _updateDailyExchangeRateFunction() {
		let getExistingTask;
		console.log('Running cron job to get daily exchange rate...');

		try {
			getExistingTask = await prisma.taskQueue.findFirst({
				where: {
					type: TASK_TYPE.DAILY_UPDATE_EXCHANGE_RATE,
					status: TASK_STATUS.PENDING,
				},
			});
		} catch (error: unknown) {
			const errorResponse = error as Error;
			console.log('Error getting daily exchange rate task', error);
			TelegramModule.sendMessage(
				`Error getting daily exchange rate task. \n\n${errorResponse.message}`,
				config.TEST_CHAT_ID
			);
			return;
		}

		if (!getExistingTask) {
			console.log('No pending task found');
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
			console.log('Cron job to get daily exchange rate completed');

			// Save price on database
			await prisma.dailyExchangeRate.create({
				data: {
					monitorPrice: Number(prices.monitor),
					bcvPrice: Number(prices.bcv),
					date: dayjs().startOf('day').toDate(),
				},
			});
		} catch (error: unknown) {
			const errorResponse = error as Error;
			console.log('Error checking daily exchange rate function', errorResponse);

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
			console.log('Your amount in dollar from transactions table is up to date!!');
		} catch (error) {
			console.log(error);
		}
	}
}

export const TaskQueueModuleService = new TaskQueueModule();
