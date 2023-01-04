const express = require('express');
const { setWebhook, sendMessage, getMe, webhookHandler } = require('../../controllers/telegram/telegram.controller');
const router = express.Router();

router.get('/', getMe);
router.post(`/setWebhook`, setWebhook);
router.post('/sendMessage', sendMessage);
router.post('/webhook', webhookHandler);

module.exports = router;
