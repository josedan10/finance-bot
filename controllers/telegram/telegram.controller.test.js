const nock = require('nock');
const { TELEGRAM_URL } = require('../../src/telegram/variables');
const telegramController = require('./telegram.controller');

const res = {
	send: jest.fn(),
	status: jest.fn(),
};
describe('>> Telegram Controller: ', function () {
	beforeAll(() => {
		/*
        Mock API using nock for the REST API
        Endpoint. Any calls to URL https://api.telegram.org/bot
        will be intercepted by the fake_api nock  
    */
		const mockResponse = require('../../mocks/telegram/getMe.json');

		nock(`${TELEGRAM_URL}`).post('/getMe').reply(200, mockResponse);

		nock(`${TELEGRAM_URL}`).post('/sendMessage').reply(200, 'Message sent');
		nock(`${TELEGRAM_URL}`)
			.post('/sendMessage')
			.reply(200, { text: 'Registered transaction', chat_id: process.env.TEST_CHAT_ID });

		nock(`${TELEGRAM_URL}`).post('/setWebhook').reply(200, 'Webhook set');
	});

	afterAll(() => {
		nock.cleanAll();
	});

	test('Get bot information', async () => {
		const req = null;

		await telegramController.getMe(req, res);
		expect(res.send).toBeCalled();
	});

	test('Send message', async () => {
		const req = {
			body: {
				chatId: 123456789,
				message: 'Hello World',
			},
		};

		await telegramController.sendMessage(req, res);
		expect(res.send).toBeCalledWith('Message sent');
	});

	test('Set webhook', async () => {
		const req = {
			body: {
				url: 'https://webhook.site/0d9a2f3a-5b2f-4b1c-8b3f-3e7f1a9d9b9b',
			},
		};

		await telegramController.setWebhook(req, res);
		expect(res.send).toBeCalledWith('Webhook set');
	});

	test('Webhook handler', async () => {
		const req = {
			body: {
				message: {
					text: '/test 1000',
					chat: {
						id: process.env.TEST_CHAT_ID,
					},
				},
			},
		};

		await telegramController.webhookHandler(req, res);
		expect(res.send).toBeCalledWith('ok');
	});

	test('Webhook handler not found command', async () => {
		const req = {
			body: {
				message: {
					text: '/notFound 1000',
					chat: {
						id: process.env.TEST_CHAT_ID,
					},
				},
			},
		};

		await telegramController.webhookHandler(req, res);
		expect(res.send).toBeCalledWith('Command notFound not found');
	});

	test('Webhook handler not command message', async () => {
		const req = {
			body: {
				message: {
					text: 'Hello bot',
					chat: {
						id: process.env.TEST_CHAT_ID,
					},
				},
			},
		};

		await telegramController.webhookHandler(req, res);
		expect(res.send).toBeCalledWith("I don't understand you");
	});
});
