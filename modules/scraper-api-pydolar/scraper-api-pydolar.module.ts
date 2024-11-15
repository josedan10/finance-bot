import axios from 'axios';

class ScraperPydolar {
	private url: string = 'https://pydolarve.org/api/v1/dollar';

	async getPricesData() {
		try {
			const responseAxios = await axios.get(this.url);
			const currency = responseAxios?.data?.monitors;

			return {
				bcv: currency.bcv.price,
				monitor: currency.enparalelovzla.price,
			};
		} catch (error) {
			throw new Error('Error getting daily exchange rate task');
		}
	}
}

export const ScraperPydolarModule = new ScraperPydolar();
