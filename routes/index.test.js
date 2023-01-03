const request = require('supertest');
const Express = require('express');
const router = require('./index.js');

const app = new Express();
app.use('/', router);

describe('Test App', function () {
	test('responds to /', async () => {
		const res = await request(app).get('/');
		expect(res.statusCode).toBe(200);
		expect(res.text).toEqual('Server is Working with live reload!');
	});
});
