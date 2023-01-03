const { default: axios } = require('axios');
const express = require('express');
const { TELEGRAM_URL } = require('../../src/telegram/variables');
const router = express.Router();

/* GET home page. */
router.get('/', async function (req, res, next) {
	const response = await axios.get(`${TELEGRAM_URL}/getMe`);
	res.send(JSON.stringify(response.data));
});

module.exports = router;
