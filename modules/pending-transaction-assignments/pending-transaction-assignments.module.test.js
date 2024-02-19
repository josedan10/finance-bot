import Sinon from 'sinon';
import { TASK_STATUS, TASK_TYPE } from '../../src/enums/tasksStatus';
import prisma from '../database/database.module';
import { PendingTransactionAssignments } from './pending-transaction-assignments.module';
import fs from 'fs';

describe('PendingTransactionAssignmentsModule', () => {
	// Can create a pending transaction assignment with valid data
	it('should create a pending transaction assignment with valid data', async () => {
		// Mock database
		prisma.taskQueue.create = Sinon.stub().resolves({ id: 1 });
		const data = ['data1', 'data2', 'data3'];
		// Check if the file was created
		fs.writeFileSync = Sinon.stub().returns({ on: Sinon.stub(), write: Sinon.stub(), end: Sinon.stub() });
		fs.mkdirSync = Sinon.stub();
		fs.existsSync = Sinon.stub().returns(true);

		// Act
		const result = await PendingTransactionAssignments.createPendingTransactionAssignment(data, 1);

		// Assert
		expect(result).toEqual({ id: 1 });
		Sinon.assert.calledOnce(prisma.taskQueue.create);
		Sinon.assert.calledWith(prisma.taskQueue.create, {
			type: TASK_TYPE.ASSIGN_CATEGORY_TO_PENDING_TRANSACTIONS,
			status: TASK_STATUS.PENDING,
			body: 'pending-transaction-assignments/transaction-1.txt',
			attemptsRemaining: 1,
			createdBy: 'system',
		});
		Sinon.assert.notCalled(fs.mkdirSync);
		Sinon.assert.calledOnce(fs.writeFileSync);
		Sinon.assert.calledWith(fs.writeFileSync, 'pending-transaction-assignments/transaction-1.txt');
	});

	it('should create a pending transaction assignment with valid data and create a folder if it does not exist', async () => {
		// Mock database
		prisma.taskQueue.create = Sinon.stub().resolves({ id: 1 });
		const data = ['data1', 'data2', 'data3'];
		// Check if the file was created
		fs.writeFileSync = Sinon.stub().returns({ on: Sinon.stub(), write: Sinon.stub(), end: Sinon.stub() });
		fs.mkdirSync = Sinon.stub();
		fs.existsSync = Sinon.stub().returns(false);

		// Act
		const result = await PendingTransactionAssignments.createPendingTransactionAssignment(data, 1);

		// Assert
		expect(result).toEqual({ id: 1 });
		Sinon.assert.calledOnce(prisma.taskQueue.create);
		Sinon.assert.calledWith(prisma.taskQueue.create, {
			type: TASK_TYPE.ASSIGN_CATEGORY_TO_PENDING_TRANSACTIONS,
			status: TASK_STATUS.PENDING,
			body: 'pending-transaction-assignments/transaction-1.txt',
			attemptsRemaining: 1,
			createdBy: 'system',
		});
		Sinon.assert.calledOnce(fs.mkdirSync);
		Sinon.assert.calledOnce(fs.writeFileSync);
		Sinon.assert.calledWith(fs.writeFileSync, 'pending-transaction-assignments/transaction-1.txt');
	});

	// Can get a list of pending transaction assignments with status 'pending'
	it('should get a list of pending transaction assignments with status "pending"', async () => {
		// Arrange
		prisma.taskQueue.findMany = Sinon.stub().resolves([{ id: 1 }, { id: 2 }]);

		// Act
		const result = await PendingTransactionAssignments.getPendingTransactionAssignments();

		// Assert
		expect(result).toEqual([{ id: 1 }, { id: 2 }]);
		Sinon.assert.calledOnce(prisma.taskQueue.findMany);
		Sinon.assert.calledWith(prisma.taskQueue.findMany, {
			where: {
				type: TASK_TYPE.ASSIGN_CATEGORY_TO_PENDING_TRANSACTIONS,
				status: TASK_STATUS.PENDING,
			},
		});
	});

	// Can handle and throw an error if no data is provided when creating a pending transaction assignment
	it('should throw an error if no data is provided when creating a pending transaction assignment', async () => {
		// Act & Assert
		await expect(PendingTransactionAssignments.createPendingTransactionAssignment()).rejects.toThrow('No data found');
	});

	// Can handle and throw an error if invalid data is provided when creating a pending transaction assignment
	it('should throw an error if invalid data is provided when creating a pending transaction assignment', async () => {
		const data = null;

		// Act & Assert
		await expect(PendingTransactionAssignments.createPendingTransactionAssignment(data)).rejects.toThrow(
			'No data found'
		);
	});

	// Can handle and throw an error if no transaction id is provided when creating a pending transaction assignment
	it('should throw an error if no transaction id is provided when creating a pending transaction assignment', async () => {
		// Arrange
		const data = ['data1', 'data2', 'data3'];

		// Act & Assert
		await expect(PendingTransactionAssignments.createPendingTransactionAssignment(data)).rejects.toThrow(
			'No transaction id found'
		);
	});

	// Can handle and throw an error if there is an error creating the task when creating a pending transaction assignment
	it('should throw an error if there is an error creating the task when creating a pending transaction assignment', async () => {
		// Arrange
		prisma.taskQueue.create = Sinon.stub().rejects(new Error('Error creating task'));
		const data = ['data1', 'data2', 'data3'];
		const transactionId = 1;

		// Act & Assert
		await expect(PendingTransactionAssignments.createPendingTransactionAssignment(data, transactionId)).rejects.toThrow(
			'Error creating task'
		);
	});

	it('should throw an error if there is an error creating the file when creating a pending transaction assignment', async () => {
		// Arrange
		prisma.taskQueue.create = Sinon.stub().resolves({ id: 1 });
		const data = ['data1', 'data2', 'data3'];
		const transactionId = 1;
		fs.writeFileSync = Sinon.stub().throws(new Error('Error creating file'));

		// Act & Assert
		await expect(PendingTransactionAssignments.createPendingTransactionAssignment(data, transactionId)).rejects.toThrow(
			'Error creating file'
		);
	});
});
