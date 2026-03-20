import { ScraperPydolarModule } from './scraper-api-pydolar.module';
import Sinon from 'sinon';
import axios from 'axios';

const sandbox = Sinon.createSandbox();

describe('ScraperPydolarModule', () => {
	afterEach(() => {
		sandbox.restore();
	});

	it('should return an object with the exchange rate', async () => {
		sandbox.stub(axios, 'get').resolves({
			data: {
				monitors: {
					bcv: {
						price: 3.5,
					},
					enparalelovzla: {
						price: 4,
					},
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
		sandbox.stub(axios, 'get').rejects(new Error('Network error'));

		await expect(ScraperPydolarModule.getPricesData()).rejects.toThrow('Error getting daily exchange rate task');
	});
});
