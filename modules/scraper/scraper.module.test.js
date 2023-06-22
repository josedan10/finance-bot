import { Scraper, CookiesGenerator } from './scraper.module.js';
import { jest } from '@jest/globals';

describe('Scraper', () => {
	let scraper;

	beforeAll(async () => {
		scraper = new Scraper();
		await scraper.start();
	});

	afterAll(async () => {
		await scraper.closeBrowser();
	});

	test('start should initialize the browser and page', () => {
		expect(scraper.browser).toBeDefined();
		expect(scraper.page).toBeDefined();
	});

	test('takeScreenshot should save a screenshot in development mode', async () => {
		process.env.APP_MODE = 'development';
		await scraper.page.goto('https://instagram.com', { waitUntil: 'networkidle2' });
		await scraper.takeScreenshot('test-screenshot');
		// Add assertions to check if the screenshot was saved successfully
		// For example: check if the screenshot file exists
	});

	test('closeBrowser should close the page and browser', async () => {
		await scraper.closeBrowser();
		expect(scraper.page).toBeNull();
		expect(scraper.browser).toBeNull();
	});

	test('resetPuppeteer should close and initialize puppeteer', async () => {
		await scraper.resetPuppeteer();
		expect(scraper.browser).toBeDefined();
		expect(scraper.page).toBeDefined();
	});
});

describe('CookiesGenerator', () => {
	const logSpy = jest.spyOn(console, 'log');

	test('generateCookies should generate and save cookies', async () => {
		await CookiesGenerator.generateCookies();
		expect(logSpy).toHaveBeenCalledWith('Saved Cookies');
	});
});
