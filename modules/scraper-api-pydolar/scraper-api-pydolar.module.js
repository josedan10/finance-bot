import axios from 'axios';

class ScraperPydolar {
	constructor() {
		this.url = 'https://pydolarvenezuela-api.vercel.app/api/v1/dollar/';
	}

	async getPricesData() {
		const responseAxios = await axios.get(this.url);
		const currency = responseAxios.data.monitors;

		return {
			bcv: currency.bcv,
			monitor: currency.enparalelovzla,
		};
	}
}

export const ScraperPydolarModule = new ScraperPydolar();
