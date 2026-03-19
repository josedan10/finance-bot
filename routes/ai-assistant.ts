import express from 'express';
import { requireAuth } from '../src/lib/auth.middleware';
import * as AIController from '../controllers/ai-assistant/ai-assistant.controller';

const router = express.Router();

// All AI routes require authentication
router.use(requireAuth);

router.get('/settings', AIController.getAISettings);
router.put('/settings', AIController.updateAISettings);
router.post('/scan-receipt', AIController.scanReceipt);
router.post('/analyze', AIController.analyzeTransactions);
router.post('/suggest-budget', AIController.getBudgetSuggestions);

export const AIAssistantRouter = router;
