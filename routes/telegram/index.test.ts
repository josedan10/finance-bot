import request from 'supertest';
import express, { Express } from 'express';
import { TelegramRouter as router } from '.';
import nock from 'nock';
import mockResponse from '../../mocks/telegram/getMe.json';

const app: Express = express();
app.use('/telegram', router);

describe('>> Telegram Routes: ', function () {
	beforeAll(() => {
		/*
        Mock API using nock for the REST API
        Endpoint. Any calls to URL https://api.telegram.org/bot
        will be intercepted by the fake_api nock  
    */
		nock(`http://localhost:5000`).get('/telegram').reply(200, { data: mockResponse });
	});

	afterAll(() => {
		nock.cleanAll();
	});

	test('Service response', async () => {
		const res = await request(app).get('/telegram');
		expect(res.statusCode).toBe(200);
	});
});
