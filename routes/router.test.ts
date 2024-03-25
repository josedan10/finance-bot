import request from 'supertest';
import express, { Express } from 'express';
import { RouterApp as router } from '.';

const app: Express = express();
app.use('/', router);

describe('>> Test App', function () {
	test('responds to /', async () => {
		const res = await request(app).get('/');
		expect(res.statusCode).toBe(200);
		expect(res.text).toEqual('Server is Working with live reload!');
	});
});
