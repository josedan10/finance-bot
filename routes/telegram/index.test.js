import request from 'supertest';
import Express from 'express';
import router from './index.js';
import nock from 'nock';
import fs from 'fs';
const loadJSON = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const mockResponse = loadJSON('../../mocks/telegram/getMe.json');

const app = new Express();
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
