import nock from 'nock';
import { TELEGRAM_URL } from '../../src/telegram/variables';
import telegramModule from './telegram.module';
import fs from 'fs';

const loadJSON = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const mockResponse = loadJSON('../../mocks/telegram/getMe.json');

describe('>> Telegram Bot Module: ', function () {
	beforeAll(() => {
		/*
        Mock API using nock for the REST API
        Endpoint. Any calls to URL https://api.telegram.org/bot
        will be intercepted by the fake_api nock  
    */

		nock(`${TELEGRAM_URL}`).post('/getMe').reply(200, mockResponse);

		nock(`${TELEGRAM_URL}`).post('/sendMessage').reply(200, 'Message sent');

		nock(`${TELEGRAM_URL}`).post('/setWebhook').reply(200, 'Webhook set');
	});

	afterAll(() => {
		nock.cleanAll();
	});

	test('Get bot information', async () => {
		const res = await telegramModule.sendRequest('getMe');
		expect(res.status).toBe(200);
	});

	test('Send message', async () => {
		const res = await telegramModule.sendMessage('Hello World', 123456789);
		expect(res.status).toBe(200);
		expect(res.data).toBe('Message sent');
	});

	test('Set webhook', async () => {
		const res = await telegramModule.setWebhook('https://webhook.site/0d9a2f3a-5b2f-4b1c-8b3f-3e7f1a9d9b9b');
		expect(res.status).toBe(200);
		expect(res.data).toBe('Webhook set');
	});

	test('Command parser', () => {
		const command = telegramModule.commandParser('/cashTransaction 1234');
		expect(command.commandName).toBe('cashTransaction');
		expect(command.commandArgs).toContain('1234');
	});
});
