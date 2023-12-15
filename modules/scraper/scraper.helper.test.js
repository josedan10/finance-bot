import { getScreenshotsByTaskId, randomSleep, sleep } from './scraper.helper';
import fs from 'fs';
import { jest } from '@jest/globals';

describe('code snippet', () => {
	// The sleep function should return a promise that resolves after the given number of milliseconds.
	it('should return a promise that resolves after the given number of milliseconds', async () => {
		const start = Date.now();
		await sleep(2000);
		const end = Date.now();
		expect(end - start).toBeGreaterThanOrEqual(2000);
	});

	// The randomSleep function should return a promise that resolves after a random number of milliseconds between the given min and max values.
	it('should return a promise that resolves after a random number of milliseconds between the given min and max values', async () => {
		const start = Date.now();
		await randomSleep(1000, 3000);
		const end = Date.now();
		expect(end - start).toBeGreaterThanOrEqual(1000);
		expect(end - start).toBeLessThanOrEqual(3000);
	});

	// The default values for the sleep function should be 3000 milliseconds.
	it('should have default values of 3000 milliseconds', async () => {
		const start = Date.now();
		await sleep();
		const end = Date.now();
		expect(end - start).toBeGreaterThanOrEqual(3000);
	});

	// The sleep function should work correctly with a value of 0 passed in.
	it('should work correctly with a value of 0 passed in', async () => {
		const start = Date.now();
		await sleep(0);
		const end = Date.now();
		expect(end - start).toBeLessThan(100);
	});
});

describe('getScreenshotsByTaskId', () => {
	// Returns an array of objects containing the path and caption of each image in the specified task folder
	it('should return an array of objects with path and caption when the specified task folder exists and is not empty', () => {
		const taskId = 'existingTask';
		// mock fs.readdirSync
		jest.spyOn(fs, 'readdirSync').mockReturnValue(['image1.jpg', 'image2.jpg', 'image3.jpg']);

		const expected = [
			{ path: './screenshots/existingTask/image1.jpg', caption: 'Task num existingTask: image1.jpg' },
			{ path: './screenshots/existingTask/image2.jpg', caption: 'Task num existingTask: image2.jpg' },
			{ path: './screenshots/existingTask/image3.jpg', caption: 'Task num existingTask: image3.jpg' },
		];
		const actual = getScreenshotsByTaskId(taskId);
		expect(actual).toEqual(expected);
	});

	// Returns an empty array if the specified task folder does not exist or is empty
	it('should return an empty array when the specified task folder does not exist', () => {
		const taskId = 'nonExistingTask';
		jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
		const expected = [];
		const actual = getScreenshotsByTaskId(taskId);
		expect(actual).toEqual(expected);
	});
});
