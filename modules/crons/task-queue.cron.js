import cron from 'node-cron';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus.js';
import { getDailyPriceFromMonitor } from '../../controllers/data-enrichment/scraper.controller.js';

import prisma from '../database/database.module.js';

// https://medium.com/@kevinstonge/testing-scheduled-node-cron-tasks-6a808be30acd
// https://stackoverflow.com/questions/61765291/testing-a-node-cron-job-function-with-jest

// const dailyUpdateMonitorTaskCronExpression = '0 * * * 1-5';
// const createDailyUpdateMonitorTaskCronExpression = '0 10 * * 1-5';

// run every 30 seconds
const dailyUpdateMonitorTaskCronExpression = '*/30 * * * * *';

// run every 30 minutes
const createDailyUpdateMonitorTaskCronExpression = '0 */30 * * * *';

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

	start() {
		this._isRunning = false;

		console.log('Starting task queue module...');

		this.startDailyUpdateMonitor.start();
		this.createTheDailyUpdateMonitorTask.start();
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

	async _checkDailyUpdateMonitorFunction() {
		try {
			// Reads the taskqueue table and executes the tasks related to daily price update
			this._isRunning = true;
			console.log('Running cron job to get daily price...');
			const pendingTask = await prisma.taskQueue.findFirst({
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
					await getDailyPriceFromMonitor();
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

					this._isRunning = false;

					return;
				}

				await prisma.taskQueue.update({
					where: {
						id: pendingTask.id,
					},
					data: {
						status: TASK_STATUS.COMPLETED,
					},
				});

				console.log('Task executed successfully, updating task queue...');
				this._isRunning = false;
			} else {
				console.log('No pending task found, skipping...');
				this._isRunning = false;
			}
		} catch (error) {
			console.log('Error checking daily update monitor function', error);
		}
	}
}

export const TaskQueueModuleService = new TaskQueueModule();
