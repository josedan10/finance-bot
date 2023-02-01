import express from 'express';
import { setWebhook, sendMessage, getMe, webhookHandler } from '../../controllers/telegram/telegram.controller.js';
const router = express.Router();

router.get('/', getMe);
router.post(`/setWebhook`, setWebhook);
router.post('/sendMessage', sendMessage);
router.post('/webhook', webhookHandler);

export default router;
