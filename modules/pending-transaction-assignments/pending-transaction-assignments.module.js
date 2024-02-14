import fs from 'fs';
import prisma from '../database/database.module.js';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus.js';

class PendingTransactionAssignmentsModule {
	constructor(prismaService) {
		this._db = prismaService;
	}

	async createPendingTransactionAssignment(data, transactionId) {
		if (!data) {
			throw new Error('No data found');
		}

		if (!transactionId) {
			throw new Error('No transaction id found');
		}

		// Create a folder if it doesn't exist named "pending-transaction-assignments"
		if (!fs.existsSync('pending-transaction-assignments')) {
			fs.mkdirSync('pending-transaction-assignments');
		}

		try {
			// Create a .txt file
			fs.writeFileSync(`pending-transaction-assignments/transaction-${transactionId}.txt`, data.join('\n'));
		} catch (error) {
			throw new Error('Error creating file');
		}

		try {
			// Create a task
			const pendingTransactionAssignment = await this._db.taskQueue.create({
				type: TASK_TYPE.ASSIGN_CATEGORY_TO_PENDING_TRANSACTIONS,
				status: TASK_STATUS.PENDING,
				body: `pending-transaction-assignments/transaction-${transactionId}.txt`,
				attemptsRemaining: 1,
				createdBy: 'system',
			});

			return pendingTransactionAssignment;
		} catch (error) {
			console.log(error);
			throw new Error('Error creating task');
		}
	}

	async getPendingTransactionAssignments() {
		return this._db.taskQueue.findMany({
			where: {
				type: TASK_TYPE.ASSIGN_CATEGORY_TO_PENDING_TRANSACTIONS,
				status: TASK_STATUS.PENDING,
			},
		});
	}
}

export const PendingTransactionAssignments = new PendingTransactionAssignmentsModule(prisma);
