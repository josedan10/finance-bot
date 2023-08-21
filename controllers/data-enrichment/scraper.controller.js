import prisma from '../../modules/database/database.module.js';
import { InstagramScraper } from '../../modules/scraper/scraper.module.js';
import Dayjs from 'dayjs';

export async function getDailyPriceFromMonitor(req, res) {
	try {
		res.send('Starting scraping process...');
		const scraper = new InstagramScraper();
		const { price, date } = await scraper.getLatestPriceFromPost();
		const postDate = Dayjs(date).format('YYYY-MM-DD');

		const result = await prisma.dailyExchangeRate.upsert({
			where: {
				date: postDate,
			},
			update: {
				monitorPrice: price,
			},
			create: {
				date: postDate,
				monitorPrice: price,
			},
		});

		console.log(result);
	} catch (error) {
		console.error(error);
		res.send(error.message);
		res.status(500);
	}
}
