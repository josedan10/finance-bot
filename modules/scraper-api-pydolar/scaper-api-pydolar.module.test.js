import nock from 'nock';
import { ScraperPydolarModule } from './scraper-api-pydolar.module.js';

describe('ScraperPydolarModule', () => {
	afterAll(() => {
		nock.cleanAll();
	});

	it('should return an object with the exchange rate', async () => {
		nock('https://pydolarvenezuela-api.vercel.app/api/v1')
			.get('/dollar/')
			.reply(200, {
				monitors: {
					bcv: {
						price: 3.5,
					},
					enparalelovzla: {
						price: 4,
					},
				},
			});

		const result = await ScraperPydolarModule.getPricesData();
		expect(result).toHaveProperty('bcv');
		expect(result).toHaveProperty('monitor');

		expect(result.bcv).toBe(3.5);
		expect(result.monitor).toBe(4);
	});

	it('should throw an error if the request fails', async () => {
		nock('https://pydolarvenezuela-api.vercel.app/api/v1').get('/dollar/').reply(500);

		await expect(ScraperPydolarModule.getPricesData()).rejects.toThrow('Error getting daily exchange rate task');
	});
});
