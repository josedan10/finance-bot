import { jest } from '@jest/globals';
import nock from 'nock';
import { TELEGRAM_BOT_URL, TELEGRAM_FILE_URL } from '../../src/telegram/variables';
import * as telegramController from './telegram.controller';
import fs from 'fs';

const loadJSON = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const mockResponse = loadJSON('../../mocks/telegram/getMe.json');

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

		nock(`${TELEGRAM_BOT_URL}`).post('/getMe').reply(200, mockResponse);

		nock(`${TELEGRAM_BOT_URL}`).post('/sendMessage').reply(200, 'Message sent');
		nock(`${TELEGRAM_BOT_URL}`)
			.post('/sendMessage')
			.reply(200, { text: 'Registered transaction', chat_id: process.env.TEST_CHAT_ID });

		nock(`${TELEGRAM_BOT_URL}`)
			.post('/sendMessage')
			.reply(200, { text: 'Registered transaction', chat_id: process.env.TEST_CHAT_ID });

		nock(`${TELEGRAM_BOT_URL}`)
			.post('/getFile')
			.query(true)
			.reply(200, {
				ok: true,
				result: {
					file_id: 'BQACAgEAAxkBAAOqZBeU2aXylxQOIaSaR-mb1RfhedoAAkgDAAJ7irhEP_H5SodwXKgvBA',
					file_unique_id: 'AgADSAMAAnuKuEQ',
					file_size: 49874,
					file_path: 'documents/file_46.xlsx',
				},
			});

		nock(`${TELEGRAM_FILE_URL}`)
			.get('/documents/file_46.xlsx')
			.reply(
				200,
				`"Mercantil Banco, Sistema de Banca por Internet",,,,
		Fecha,Descripción,No. de Referencia,Débito,Crédito
		03/ENE/2023,CAHO DE BETTY POR PAGO CENA NAVIDEA,338734,,6.01
		03/ENE/2023,INTERNA JOSE DE DIOS QUINTER *7352,70159,631.24,
		03/ENE/2023,COMPRAS/20221229/08:43:32/385571/LUKAPAY RIDERY        0 021,385571,2.08,
		03/ENE/2023,COMPRAS/20221229/10:26:07/386352/LUKAPAY RIDERY        0 021,386352,2.08,
		03/ENE/2023,COMPRAS/20221229/18:51:38/391248/LUKAPAY RIDERY        0 021,391248,4.63,
		03/ENE/2023,COMPRA/20221230/12:40:00/391921/LUKAPAY*RIDERY,391921,7.64,
		03/ENE/2023,COMPRA/20221230/12:40:00/391955/LUKAPAY*RIDERY,391955,3.54,
		03/ENE/2023,COMPRA/20221230/12:40:00/391985/LUKAPAY*RIDERY,391985,1.90,`
			);

		nock(`${TELEGRAM_BOT_URL}`).post('/setWebhook').reply(200, 'Webhook set');
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

	test('Webhook handler for documents', async () => {
		const req = {
			body: {
				message: {
					caption: '/mercantil',
					document: {
						file_id: 'BQACAgEAAxkBAAOqZBeU2aXylxQOIaSaR-mb1RfhedoAAkgDAAJ7irhEP_H5SodwXKgvBA',
					},
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
