import puppeteer from 'puppeteer-extra';
import { executablePath } from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import fs from 'fs';
import dotenv from 'dotenv';
import { extractDateFromDescription, extractPriceFromInstagramDescription } from '../../src/helpers/price.helper.js';
import { randomSleep, sleep } from './scraper.helper.js';

dotenv.config();
const cookieName = `./cookies-scraper.json`;

export class Scraper {
	constructor(taskId) {
		this.username = process.env.IG_USERNAME;
		this.password = process.env.IG_PASSWORD;
		this.targetURL = 'https://www.instagram.com/monitordolar3/';
		this.browser = null;
		this.start = this.start.bind(this);
		this.page = null;
		this.url = 'https://www.instagram.com/';
		this.responseTimeout = 30000;
		this.taskId = taskId;
	}

	async start() {
		this.browser = await puppeteer.launch({
			headless: process.env.APP_MODE !== 'development',
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
		await this.page.setJavaScriptEnabled(true);
		await this.page.setUserAgent(
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36'
		);
	}

	async takeScreenshot(name) {
		if (Number(process.env.SAVE_SCREENSHOTS)) {
			try {
				await mkdir(`./screenshots/${this.taskId}`, { recursive: true });

				await this.page.screenshot({
					path: `./screenshots/${this.taskId}/${name}-${Date.now().valueOf()}.png`,
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

	async savePageAsHTML(name) {
		if (process.env.APP_MODE === 'development') {
			const productObj = await this.page.evaluate(() => document.body.outerHTML);

			try {
				await mkdir('./pages', { recursive: true });

				fs.writeFileSync(`./pages/${name}-${Date.now().valueOf()}.html`, productObj, { flag: 'w' });
			} catch (error) {
				console.error('Error taking screenshot', error);
			}
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

	async getCurrentUrl() {
		try {
			return this.page.url();
		} catch (err) {
			console.log('There was an error getting the current url', err);
		}
	}
}

export class CookiesGenerator {
	static async generateCookies(taskId) {
		const scraper = new Scraper(taskId);
		await scraper.start();

		console.log('Generating cookies for', scraper.username);

		const page = await scraper.page;

		await page.goto('https://www.instagram.com', { waitUntil: 'networkidle2' });
		await page.type('[name="username"]', scraper.username, { delay: 30 });
		await page.type('[name="password"]', scraper.password, { delay: 30 });

		scraper.takeScreenshot('login');
		await page.click('button[type="submit"]');
		scraper.takeScreenshot('login-submit');

		await page.waitForNavigation({ waitUntil: 'networkidle2' });
		randomSleep(2000);

		const url = await page.url();

		if (url.includes('accounts/onetap')) {
			console.log('Saving Browser Information...');
			await scraper.takeScreenshot('save-browser-info');
			// Click on "Save info" button

			// Button classes: "_acan _acap _acas _aj1- _ap30"
			const buttonSelector = 'button._acan._acap._acas._aj1-._ap30';
			await page.waitForSelector(buttonSelector);
			await page.click(buttonSelector);

			await page.waitForNavigation({ waitUntil: 'networkidle2' });
		}

		try {
			// replace with setTimeout
			console.log('Saving Cookies...');
			sleep(5000);
			await scraper.takeScreenshot('save-cookies');
			await mkdir('./cookies', { recursive: true });
			const currentCookies = await page.cookies();
			fs.writeFileSync(`./cookies/${cookieName}`, JSON.stringify(currentCookies), { flag: 'w' });
			console.log('Saved Cookies');
		} catch (err) {
			console.log('Failed to Save Cookies');
			throw err;
		} finally {
			await page.close();
			await scraper.browser.close();
		}
	}

	static async getCookies() {
		try {
			const cookies = JSON.parse(fs.readFileSync(`./cookies/${cookieName}`));
			return cookies;
		} catch (err) {
			console.log('Error getting cookies', err);
		}
	}
}

export class InstagramScraper extends Scraper {
	postClassSelector =
		'article ._ac7v .x1i10hfl.xjbqb8w.x6umtig.x1b1mbwd.xaqea5y.xav7gou.x9f619.x1ypdohk.xt0psk2.xe8uvvx.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.xexx8yu.x4uap5.x18d9i69.xkhd6sd.x16tdsg8.x1hl2dhg.xggy1nq.x1a2a7pz._a6hd';

	postDescriptionSelector = '._a9zn._a9zo h1._aacl._aaco._aacu._aacx._aad7._aade';

	/**
	 * @description
	 * This method go to the latest post of the target account and take a screenshot
	 */
	async getLatestPriceFromPost() {
		try {
			let cookies = await CookiesGenerator.getCookies();

			if (!cookies) {
				await CookiesGenerator.generateCookies();
				cookies = await CookiesGenerator.getCookies();
			}

			await this.start();

			await this.page.setCookie(...cookies);
			console.log('Cookies set');
			await this.page.goto(this.targetURL, { waitUntil: 'networkidle2' });
			await new Promise((resolve) => setTimeout(resolve, this.responseTimeout));
			await this.takeScreenshot('monitor-dolar');
			await this.savePageAsHTML('monitor-dolar');

			console.log('Getting post data');
			try {
				await this.page.click(this.postClassSelector);
			} catch (error) {
				console.log('Error clicking on post', error);
				await this.takeScreenshot('monitor-dolar-post-error');
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, this.responseTimeout));
			console.log('Post data loaded');
			await this.takeScreenshot('monitor-dolar-post');

			const descriptionText = await this.page.$eval(this.postDescriptionSelector, (el) => el.innerText);

			if (!descriptionText) {
				throw new Error('Description text not found');
			}

			return {
				date: extractDateFromDescription(descriptionText),
				price: extractPriceFromInstagramDescription(descriptionText),
			};
		} catch (error) {
			console.log('Error getting latest price', error);
			throw error;
		}
	}
}
