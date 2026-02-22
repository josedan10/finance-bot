import axios from 'axios';
import { config } from '../../src/config';

class ScraperPydolar {
	private url: string = config.PYDOLAR_API_URL;

	async getPricesData() {
		try {
			const responseAxios = await axios.get(this.url);
			const currency = responseAxios?.data?.monitors;

			return {
				bcv: currency.bcv.price,
				monitor: currency.enparalelovzla.price,
			};
		} catch (error) {
			throw new Error('Error getting daily exchange rate task', { cause: error });
		}
	}
}

export const ScraperPydolarModule = new ScraperPydolar();
