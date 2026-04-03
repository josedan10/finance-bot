import express from 'express';
import multer from 'multer';
import { requireAuth } from '../src/lib/auth.middleware';
import { AppError } from '../src/lib/appError';
import { config } from '../src/config';
import * as AIController from '../controllers/ai-assistant/ai-assistant.controller';

const router = express.Router();
const receiptUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: config.RECEIPT_UPLOAD_MAX_FILE_SIZE_BYTES },
	fileFilter: (_req, file, cb) => {
		if (file.mimetype?.startsWith('image/')) {
			cb(null, true);
			return;
		}

		cb(new AppError('Unsupported receipt image format', 415));
	},
});

const receiptUploadMiddleware: express.RequestHandler = (req, res, next) => {
	receiptUpload.single('image')(req, res, (error: unknown) => {
		const uploadError = error as { code?: string } | undefined;
		if (uploadError?.code === 'LIMIT_FILE_SIZE') {
			next(new AppError('Receipt image is too large. Please upload a smaller image.', 413));
			return;
		}

		if (error) {
			next(error instanceof Error ? error : new Error('Failed to process receipt upload'));
			return;
		}

		next();
	});
};

// All AI routes require authentication
router.use(requireAuth);

router.get('/settings', AIController.getAISettings);
router.put('/settings', AIController.updateAISettings);
router.post('/scan-receipt', receiptUploadMiddleware, AIController.scanReceipt);
router.post('/receipt-analysis', receiptUploadMiddleware, AIController.scanReceipt);
router.post('/analyze', AIController.analyzeTransactions);
router.post('/suggest-budget', AIController.getBudgetSuggestions);

export const AIAssistantRouter = router;
