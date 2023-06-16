import express from 'express';
import {
	setWebhook,
	sendMessage,
	getMe,
	webhookHandler,
	setCommands,
} from '../../controllers/telegram/telegram.controller.js';
const router = express.Router();

router.get('/', getMe);
router.post(`/setWebhook`, setWebhook);
router.post('/sendMessage', sendMessage);
router.post('/webhook', webhookHandler);
router.post('/setCommands', setCommands);

export default router;
