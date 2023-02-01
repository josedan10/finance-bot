import express from 'express';
import telegramRouter from './telegram/index.js';

const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
	res.send('Server is Working with live reload!');
});

router.use('/telegram', telegramRouter);

export default router;
