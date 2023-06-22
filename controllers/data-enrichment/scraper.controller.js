import prisma from '../../modules/database/database.module.js';
import { InstagramScraper } from '../../modules/scraper/scraper.module.js';
import Dayjs from 'dayjs';

export async function getDailyPriceFromMonitor(req, res) {
	try {
		res.send('Starting scraping process...');
		const scraper = new InstagramScraper();
		const price = await scraper.getLatestPriceFromPost();
		const todayDate = Dayjs().format('YYYY-MM-DD');

		const result = await prisma.dailyPrices.upsert({
			where: {
				date: todayDate,
			},
			update: {
				monitorPrice: price,
			},
			create: {
				date: todayDate,
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
