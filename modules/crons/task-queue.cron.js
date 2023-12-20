import cron from 'node-cron';
import fs from 'fs/promises';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus.js';
import { getDailyPriceFromMonitor } from '../../controllers/data-enrichment/scraper.controller.js';

import prisma from '../database/database.module.js';
import { CookiesGenerator } from '../scraper/scraper.module.js';
import TelegramModule from '../telegram/telegram.module.js';
import { getScreenshotsByTaskId } from '../scraper/scraper.helper.js';

// https://medium.com/@kevinstonge/testing-scheduled-node-cron-tasks-6a808be30acd
// https://stackoverflow.com/questions/61765291/testing-a-node-cron-job-function-with-jest

// once per hour
const dailyUpdateMonitorTaskCronExpression = '0 * * * 1-5';

// once per day
const createDailyUpdateMonitorTaskCronExpression = '0 10 * * 1-5';

// once per week
const generateCookiesTaskCronExpression = '0 10 * * 1';
const createCookiesTaskCronExpression = '0 09 * * 1';

// TEST CRON EXPRESSIONS
// run every minute
// const generateCookiesTaskCronExpression = '0 */2 * * * *';
// const dailyUpdateMonitorTaskCronExpression = '0 */1 * * * *';

// run every 30 seconds
// const dailyUpdateMonitorTaskCronExpression = '*/30 * * * * *';

// run every 30 minutes
// const createDailyUpdateMonitorTaskCronExpression = '0 */30 * * * *';

export class TaskQueueModule {
	startDailyUpdateMonitor = cron.schedule(
		dailyUpdateMonitorTaskCronExpression,
		this._checkDailyUpdateMonitorFunction.bind(this),
		{
			timezone: 'America/Caracas',
		}
	);

	createTheDailyUpdateMonitorTask = cron.schedule(
		createDailyUpdateMonitorTaskCronExpression,
		this._createDailyMonitorTask.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	cookiesGenerationTask = cron.schedule(generateCookiesTaskCronExpression, this._generateCookies.bind(this), {
		timezone: 'America/Caracas',
		scheduled: true,
	});

	createGenerateCookiesTask = cron.schedule(
		createCookiesTaskCronExpression,
		this._createCookiesGenerationTask.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	deleteImagesFolderOlderThan5Days = cron.schedule(
		createCookiesTaskCronExpression,
		this._deleteImagesFolderOlderThan5Days.bind(this),
		{
			timezone: 'America/Caracas',
			scheduled: true,
		}
	);

	start() {
		this._isRunningDailyTask = false;
		this._isRunningCookiesTask = false;

		console.log('Starting task queue module...');

		this.startDailyUpdateMonitor.start();
		this.createTheDailyUpdateMonitorTask.start();
		this.cookiesGenerationTask.start();
		this.deleteImagesFolderOlderThan5Days.start();
	}

	async _createDailyMonitorTask() {
		try {
			console.log('Creating daily monitor task...');
			await prisma.taskQueue.create({
				data: {
					type: TASK_TYPE.DAILY_UPDATE_MONITOR,
					status: TASK_STATUS.PENDING,
					attemptsRemaining: 3,
					createdBy: 'system',
				},
			});
		} catch (error) {
			console.log('Error creating daily monitor task', error);
		}
	}

	async _createCookiesGenerationTask() {
		try {
			console.log('Creating cookies generation task...');

			const getExistingTask = await prisma.taskQueue.findFirst({
				where: {
					type: TASK_TYPE.GENERATE_COOKIES,
					status: TASK_STATUS.PENDING,
				},
			});

			if (getExistingTask) {
				console.log('Cookies generation task already exists, skipping...');
				return;
			}

			await prisma.taskQueue.create({
				data: {
					type: TASK_TYPE.GENERATE_COOKIES,
					status: TASK_STATUS.PENDING,
					attemptsRemaining: 0,
					createdBy: 'system',
				},
			});
		} catch (error) {
			console.log('Error creating cookies generation task', error);
		}
	}

	async _checkDailyUpdateMonitorFunction() {
		let pendingTask;

		try {
			// Reads the taskqueue table and executes the tasks related to daily price update
			this._isRunningDailyTask = true;
			console.log('Running cron job to get daily price...');
			pendingTask = await prisma.taskQueue.findFirst({
				where: {
					status: TASK_STATUS.PENDING,
					type: TASK_TYPE.DAILY_UPDATE_MONITOR,
					attemptsRemaining: { gt: 0 },
				},
			});

			if (pendingTask) {
				console.log('Found pending task, executing...');
				await prisma.taskQueue.update({
					where: {
						id: pendingTask.id,
					},
					data: {
						status: TASK_STATUS.IN_PROGRESS,
					},
				});

				try {
					await getDailyPriceFromMonitor(pendingTask.id);
					await prisma.taskQueue.update({
						where: {
							id: pendingTask.id,
						},
						data: {
							status: TASK_STATUS.COMPLETED,
						},
					});

					console.log('Task executed successfully, updating task queue...');
				} catch (error) {
					console.log('Error executing task, updating task queue...');
					console.error(error);

					if (pendingTask.attemptsRemaining === 1) {
						await prisma.taskQueue.update({
							where: {
								id: pendingTask.id,
							},
							data: {
								status: TASK_STATUS.ERROR,
								attemptsRemaining: pendingTask.attemptsRemaining - 1,
							},
						});
					} else {
						console.log('Task failed, updating task queue and setting up to pending...');
						await prisma.taskQueue.update({
							where: {
								id: pendingTask.id,
							},
							data: {
								status: TASK_STATUS.PENDING,
								attemptsRemaining: pendingTask.attemptsRemaining - 1,
							},
						});
					}

					await TelegramModule.sendMessage(
						`Error checking daily update monitor function: ${error.message}`,
						process.env.TEST_CHAT_ID
					);

					// Send screenshots
					console.log('Sending screenshots...');
					const screenshots = getScreenshotsByTaskId(pendingTask.id);
					for (const screenshot of screenshots) {
						await TelegramModule.sendImage(screenshot.path, screenshot.caption, process.env.TEST_CHAT_ID);
					}
				}
			} else {
				console.log('No pending task found, skipping...');
			}
		} catch (error) {
			console.log('Error checking daily update monitor function', error);
		} finally {
			this._isRunningDailyTask = false;
		}
	}

	async _generateCookies() {
		if (this._isRunningCookiesTask) {
			console.log('Cookies generation task already running, skipping...');
			return;
		}

		let pendingTask;

		try {
			this._isRunningCookiesTask = true;

			pendingTask = await prisma.taskQueue.findFirst({
				where: {
					status: TASK_STATUS.PENDING,
					type: TASK_TYPE.GENERATE_COOKIES,
				},
			});

			console.log('Generating cookies...');
			await CookiesGenerator.generateCookies(pendingTask.id);
			await prisma.taskQueue.update({
				where: {
					id: pendingTask.id,
				},
				data: {
					status: TASK_STATUS.COMPLETED,
				},
			});

			console.log('🍪🍪 Cookies generated successfully!');

			await TelegramModule.sendMessage('🍪🍪 Cookies generated successfully!', process.env.TEST_CHAT_ID);
		} catch (error) {
			console.log('Error generating cookies', error);
			await TelegramModule.sendMessage(`🔴 Error generating cookies: ${error.message}`, process.env.TEST_CHAT_ID);

			// Send screenshots
			console.log('Sending screenshots...');
			const screenshots = getScreenshotsByTaskId(pendingTask.id);
			for (const screenshot of screenshots) {
				await TelegramModule.sendImage(screenshot.path, screenshot.name, process.env.TEST_CHAT_ID);
			}
		} finally {
			this._isRunningCookiesTask = false;
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
