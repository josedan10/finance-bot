import express from 'express';
import { getDailyPriceFromMonitor } from '../../controllers/data-enrichment/scraper.controller.js';
const router = express.Router();

router.get('/daily-price-update-by-monitor', getDailyPriceFromMonitor);

export default router;
