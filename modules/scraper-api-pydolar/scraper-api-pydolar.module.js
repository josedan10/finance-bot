import axios from 'axios';

class ScraperPydolar {
	constructor() {
		this.url = 'https://pydolarvenezuela-api.vercel.app/api/v1/dollar';
	}

	async getPricesData() {
		try {
			const responseAxios = await axios.get(this.url);
			const currency = responseAxios?.data?.monitors;

			return {
				bcv: currency.bcv.price,
				monitor: currency.enparalelovzla.price,
			};
		} catch (error) {
			throw new Error('Error getting daily exchange rate task', error);
		}
	}
}

export const ScraperPydolarModule = new ScraperPydolar();
