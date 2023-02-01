import request from 'supertest';
import Express from 'express';
import router from './index.js';

const app = new Express();
app.use('/', router);

describe('>> Test App', function () {
	test('responds to /', async () => {
		const res = await request(app).get('/');
		expect(res.statusCode).toBe(200);
		expect(res.text).toEqual('Server is Working with live reload!');
	});
});
