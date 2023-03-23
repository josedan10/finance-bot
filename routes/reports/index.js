import express from 'express';
import { getPDF } from '../../controllers/reports/reports.controller.js';
const router = express.Router();

router.get('/', getPDF);

export default router;
