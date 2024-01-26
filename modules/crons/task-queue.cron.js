import cron from 'node-cron';
import fs from 'fs/promises';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus.js';

import prisma from '../database/database.module.js';
import { ExchangeMonitorScraper } from '../scraper/scraper.module.js';
import TelegramModule from '../telegram/telegram.module.js';
import { getScreenshotsByTaskId } from '../scraper/scraper.helper.js';

// https://medium.com/@kevinstonge/testing-scheduled-node-cron-tasks-6a808be30acd
// https://stackoverflow.com/questions/61765291/testing-a-node-cron-job-function-with-jest

// once per hour
// const dailyUpdateExchangeRateTaskCronExpression = '0 * * * 1-5';

// once per day
const createDailyTaskCronExpression = '0 10 * * 1-5';

// once per week
const deleteImagesOlderCronExpression = '0 09 * * 1';

// TEST CRON EXPRESSIONS
// run every 10 minutes
const dailyUpdateExchangeRateTaskCronExpression = '0 */3 * * * *';

// run every 30 seconds
// const dailyUpdateExchangeRateTaskCronExpression = '*/30 * * * * *';

// run every 30 minutes
// const createDailyTaskCronExpression = '0 */30 * * * *';

export class TaskQueueModule {
	deleteImagesFolderOlderThan5Days = cron.schedule(
		deleteImagesOlderCronExpression,
		this._deleteImagesFolderOlderThan5Days.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	startDailyExchangeRateMonitor = cron.schedule(
		dailyUpdateExchangeRateTaskCronExpression,
		this._updateDailyExchangeRateFunction.bind(this),
		{
			timezone: 'America/Caracas',
		}
	);

	createDailyExchangeRateTask = cron.schedule(
		createDailyTaskCronExpression,
		this._createDailyExchangeRateTask.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	start() {
		this._isRunningDailyTask = false;
		this._isRunningCookiesTask = false;

		console.log('Starting task queue module...');

		this.createDailyExchangeRateTask.start();
		this.deleteImagesFolderOlderThan5Days.start();
	}

	async _createDailyExchangeRateTask() {
		try {
			console.log('Creating daily exchange rate task...');
			await prisma.taskQueue.create({
				data: {
					type: TASK_TYPE.DAILY_UPDATE_EXCHANGE_RATE,
					status: TASK_STATUS.PENDING,
					attemptsRemaining: 3,
					createdBy: 'system',
				},
			});
		} catch (error) {
			console.log('Error creating daily exchange rate task', error);
		}
	}

	async _updateDailyExchangeRateFunction() {
		let getExistingTask;
		console.log('Running cron job to get daily exchange rate...');

		try {
			getExistingTask = await prisma.taskQueue.findFirst({
				where: {
					type: TASK_TYPE.DAILY_UPDATE_EXCHANGE_RATE,
					status: TASK_STATUS.PENDING,
				},
			});
		} catch (error) {
			console.log('Error getting daily exchange rate task', error);
			TelegramModule.sendMessage(`Error getting daily exchange rate task. \n\n${error.message}`);
			return;
		}

		const scraper = new ExchangeMonitorScraper(getExistingTask.id);

		try {
			const price = await scraper.getPrice();

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
				`Daily exchange rate completed. \n\nMonitor Rate: ${price.monitorPrice} \nBCV Rate: ${price.bcvPrice}`,
				process.env.TEST_CHAT_ID
			);
			console.log('Cron job to get daily exchange rate completed');

			// Save price on database
			await prisma.dailyExchangeRate.create({
				data: {
					monitorPrice: Number(price.monitorPrice.replace(',', '.')),
					bcvPrice: Number(price.bcvPrice.replace(',', '.')),
					date: new Date(),
				},
			});
		} catch (error) {
			console.log('Error checking daily exchange rate function', error);

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
				`Error checking daily exchange rate function. \n\n${error.message}`,
				process.env.TEST_CHAT_ID
			);

			const screenshots = await getScreenshotsByTaskId(getExistingTask.id);

			for (const screenshot of screenshots) {
				await TelegramModule.sendImage(screenshot, screenshot.caption, process.env.TEST_CHAT_ID);
			}
		} finally {
			await scraper.close();
		}
	}

	async _deleteImagesFolderOlderThan5Days() {
		try {
			console.log('Deleting images and folders older than 5 days...');
			const fiveDaysAgo = new Date();
			fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

			// Read files and folders inside screenshots folder
			const items = await fs.readdir('./screenshots', { withFileTypes: true });

			// Filter and delete images and older folders
			for (const item of items) {
				const itemPath = `./screenshots/${item.name}`;

				if (item.isDirectory()) {
					// Delete older folders
					const folderDate = new Date(item.birthtimeMs);
					if (folderDate < fiveDaysAgo) {
						await fs.rm(itemPath, { recursive: true });
					}
				} else {
					// Delete images
					await fs.rm(itemPath);
				}
			}
		} catch (error) {
			console.log('Error deleting images and folders older than 5 days', error);
		}
	}
}

export const TaskQueueModuleService = new TaskQueueModule();
