const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
	res.send('Server is Working with live reload!');
});

router.use('/telegram', require('./telegram'));

module.exports = router;
