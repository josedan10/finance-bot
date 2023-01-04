const request = require('supertest');
const Express = require('express');
const router = require('./index.js');
const nock = require('nock');

const app = new Express();
app.use('/telegram', router);

describe('>> Telegram Routes: ', function () {
	beforeAll(() => {
		/*
        Mock API using nock for the REST API
        Endpoint. Any calls to URL https://api.telegram.org/bot
        will be intercepted by the fake_api nock  
    */
		const mockResponse = require('../../mocks/telegram/getMe.json');

		nock(`http://localhost:3000`).get('/telegram').reply(200, { data: mockResponse });
	});

	afterAll(() => {
		nock.cleanAll();
	});

	test('Service response', async () => {
		const res = await request(app).get('/telegram');
		expect(res.statusCode).toBe(200);
	});
});
