import puppeteer from 'puppeteer-extra';
import { executablePath } from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export class Scraper {
	constructor() {
		this.username = process.env.IG_USERNAME;
		this.password = process.env.IG_PASSWORD;
		this.targetURL = 'https://www.instagram.com/monitordolar3/';
		this.browser = null;
		this.start = this.start.bind(this);
		this.page = null;
		this.url = 'https://www.instagram.com/';
		this.responseTimeout = 10000;
	}

	async start() {
		this.browser = await puppeteer.launch({
			headless: 'new',
			ignoreHTTPSErrors: true,
			devtools: false,
			executablePath: executablePath(),
			args: [
				'--incognito',
				'--no-sandbox',
				'--disable-gpu',
				'--disable-notifications',
				'--disable-accelerated-2d-canvas',
				'--lang=en-US,en',
			],
			ignoreDefaultArgs: ['--disable-extensions'],
		});

		const context = await this.browser.createIncognitoBrowserContext();
		this.page = await context.newPage(this.url);
		this.page.setViewport({ width: 1400, height: 980 });
		this.page.setDefaultNavigationTimeout(this.responseTimeout);
	}

	async takeScreenshot(name) {
		if (process.env.APP_MODE === 'development') {
			try {
				await mkdir('./screenshots', { recursive: true });

				await this.page.screenshot({
					path: `./screenshots/${name}-${Date.now().valueOf()}.png`,
					fullPage: true,
					type: 'png',
				});
			} catch (error) {
				console.error('Error taking screenshot', error);
			}
		}
	}

	async closeBrowser() {
		try {
			if (this.page) {
				await this.page.close();
				this.page = null;
			}

			if (this.browser) {
				await this.browser.close();
				this.browser = null;
			}
		} catch (err) {
			console.log('There was an error closing the browser', err);
		}
	}

	async resetPuppeteer() {
		try {
			await this.closeBrowser();
			await this.start(this.baseUrl);
		} catch (err) {
			console.log('There was an error resetting puppeteer', err);
		}
	}
}

export class CookiesGenerator {
	static async generateCookies() {
		const scraper = new Scraper();
		await scraper.start();

		console.log('Generating cookies for', scraper.username);
		const cookieName = `./cookies-scraper.json`;

		const page = await scraper.browser.newPage();

		await page.goto('https://www.instagram.com', { waitUntil: 'networkidle2' });
		await page.type('[name="username"]', scraper.username, { delay: 30 });
		await page.type('[name="password"]', scraper.password, { delay: 30 });

		await page.click('button[type="submit"]');
		await page.waitForNavigation({ waitUntil: 'networkidle0' });

		try {
			// replace with setTimeout
			await new Promise((resolve) => setTimeout(resolve, 10000));

			await mkdir('./cookies', { recursive: true });
			const currentCookies = await page.cookies();
			fs.writeFileSync(`./cookies/${cookieName}`, JSON.stringify(currentCookies), { flag: 'w' });
		} catch (err) {
			console.log('Failed to login');
		}

		await page.close();
		await scraper.browser.close();

		console.log('Saved Cookies');
	}
}
