import nock from 'nock';
import { TELEGRAM_BOT_URL, TELEGRAM_FILE_URL } from '../../src/telegram/variables';
import TelegramModule from './telegram.module';
import fs from 'fs';
import FormData from 'form-data';
import Sinon from 'sinon';
import mockResponse from '../../mocks/telegram/getMe.json';

const sandbox = Sinon.createSandbox();

describe('>> Telegram Bot Module: ', function () {
	beforeAll(() => {
		/*
        Mock API using nock for the REST API
        Endpoint. Any calls to URL https://api.telegram.org/bot
        will be intercepted by the fake_api nock  
    */

		nock(`${TELEGRAM_BOT_URL}`).post('/getMe').reply(200, mockResponse);

		nock(`${TELEGRAM_BOT_URL}`).post('/sendMessage').reply(200, 'Message sent');

		nock(`${TELEGRAM_BOT_URL}`).post('/sendMessage').reply(200, 'Message sent');

		nock(`${TELEGRAM_BOT_URL}`).post('/setWebhook').reply(200, 'Webhook set');

		nock(`${TELEGRAM_BOT_URL}`).post('/getFile').query(true).reply(200, 'File found');

		nock(`${TELEGRAM_FILE_URL}`).get('/documents/file_46.xlsx').reply(200, 'File content');
	});

	afterAll(() => {
		nock.cleanAll();
	});

	afterEach(() => {
		sandbox.reset();
		sandbox.resetHistory();
		sandbox.restore();
	});

	test('Get bot information', async () => {
		const res = await TelegramModule.sendRequest('getMe');
		expect(res.ok).toBe(true);
	});

	test('Send message', async () => {
		const res = await TelegramModule.sendMessage('Hello World', 123456789);
		expect(res).toBe('Message sent');
	});

	test('Set webhook', async () => {
		const res = await TelegramModule.setWebhook('https://webhook.site/0d9a2f3a-5b2f-4b1c-8b3f-3e7f1a9d9b9b');
		expect(res).toBe('Webhook set');
	});

	test('Get file path using fileId', async () => {
		const res = await TelegramModule.getFilePath('1234');
		expect(res).toBe('File found');
	});

	test('Get file content using file path', async () => {
		const res = await TelegramModule.getFileContent('documents/file_46.xlsx');
		expect(res).toBe('File content');
	});

	test('Command parser', () => {
		const command = TelegramModule.commandParser('/cashTransaction 1234');
		expect(command.commandName).toBe('cashTransaction');
		expect(command.commandArgs).toContain('1234');
	});
});

// Generated by CodiumAI

describe('sendImage', () => {
	afterEach(() => {
		sandbox.resetHistory();
		sandbox.reset();
		sandbox.restore();
	});

	// Sends a valid image file with a blank caption to a valid chat ID
	it('should send a valid image file and caption to a valid chat ID', () => {
		// Create an instance of the TelegramBot class
		const telegramBot = TelegramModule;

		// Mock the sendRequest method
		const spySendReq = sandbox.stub(telegramBot, 'sendRequest').resolves({});

		// Mock the fs.createReadStream method
		const spyCreateReadStream = sandbox.stub(fs, 'createReadStream').resolves('stream');

		// Mock the FormData.append method
		const spyFormData = sandbox.stub(FormData.prototype, 'append');

		// Call the sendImage method
		telegramBot.sendImage('image.jpg', 'caption', 1312);

		// Assert that the necessary methods were called with the correct arguments
		sandbox.assert.calledWith(
			spySendReq,
			'sendPhoto',
			sandbox.match.instanceOf(FormData),
			{ chat_id: 1312 },
			{
				'Content-Type': 'multipart/form-data',
			}
		);
		sandbox.assert.calledWith(spyCreateReadStream, 'image.jpg');
		sandbox.assert.calledOnce(spyFormData);
	});
});
