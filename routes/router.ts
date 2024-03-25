import express from 'express';
import { TelegramRouter as telegramRouter } from './telegram';

const router = express.Router();

/* GET home page. */
router.get('/', function (req, res) {
	res.send('Server is Working with live reload!');
});

router.use('/telegram', telegramRouter);

export const RouterApp = router;
