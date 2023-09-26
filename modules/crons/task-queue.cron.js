import cron from 'node-cron';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus.js';
import { getDailyPriceFromMonitor } from '../../controllers/data-enrichment/scraper.controller.js';

const prisma = require('../database/database.module.js');

// https://medium.com/@kevinstonge/testing-scheduled-node-cron-tasks-6a808be30acd
// https://stackoverflow.com/questions/61765291/testing-a-node-cron-job-function-with-jest

cron.schedule(
	'0 * * * 1-5',
	async () => {
		// Reads the taskqueue table and executes the tasks related to daily price update
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
					status: { in: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.ERROR] },
				},
			});

			try {
				await getDailyPriceFromMonitor();
			} catch (error) {
				console.log('Error executing task, updating task queue...');
				console.error(error);

				await prisma.taskQueue.update({
					where: {
						id: pendingTask.id,
					},
					data: {
						status: TASK_STATUS.ERROR,
						attemptsRemaining: pendingTask.attemptsRemaining - 1,
					},
				});

				return;
			}

			await prisma.taskQueue.update({
				where: {
					id: pendingTask.id,
				},
				data: {
					status: TASK_STATUS.DONE,
				},
			});

			console.log('Task executed successfully, updating task queue...');
		}
	},
	{
		timezone: 'America/Caracas',
	}
);
