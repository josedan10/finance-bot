import express from 'express';
import telegramRouter from './telegram/index.js';
import reportsRouter from './reports/index.js';
import dataEnrichmentRouter from './data-enrichment/index.js';

const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
	res.send('Server is Working with live reload!');
});

router.use('/telegram', telegramRouter);
router.use('/reports', reportsRouter);
router.use('/data-enrichment', dataEnrichmentRouter);

export default router;
