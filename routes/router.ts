import express, { Request, Response } from 'express';
import { TelegramRouter as telegramRouter } from './telegram';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
	res.send('Server is Working with live reload!');
});

router.get('/health', (req: Request, res: Response) => {
	res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/telegram', telegramRouter);

export const RouterApp = router;
