import { promises as fs } from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { AISettingsService, AIAssistantFactory } from '../../modules/ai-assistant/ai-assistant.module';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import { config } from '../../src/config';
import logger from '../../src/lib/logger';
import { AppError } from '../../src/lib/appError';
import {
  getImageExtension,
  optimizeReceiptImageForOcr,
  saveReceiptProcessingImage,
} from '../../src/lib/receipt-image-storage';
import { captureException } from '../../src/lib/sentry';
import { ReceiptOcrQueueService } from '../../modules/ai-assistant/receipt-ocr-queue.service';
import { analyzeReceiptImageForUser } from '../../modules/ai-assistant/receipt-analysis.service';
import type { OCRImageInput } from '../../modules/image-2-text/image-2-text.module';

function sanitizeReceiptSource(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const sanitized = normalized.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

  if (!sanitized) {
    return 'unknown';
  }

  return sanitized.slice(0, 40);
}

function getPublicBaseUrl(req: Request): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

type UploadFileLike = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

function getRequestedTimeZone(req: Request): string | null {
  const headerValue = req.get('x-user-timezone');
  const bodyValue = typeof req.body?.timeZone === 'string' ? req.body.timeZone : null;
  const candidate = (bodyValue || headerValue || '').trim();

  if (!candidate) {
    return null;
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return null;
  }
}

export async function scanReceipt(req: Request, res: Response): Promise<void> {
  try {
    const uploadedFile = req.file as UploadFileLike | undefined;
    const image = typeof req.body?.image === 'string' ? req.body.image : null;

    if (!uploadedFile && !image) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }

    const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : 'no-request-id';
    let savedReceiptImageUrl: string | null = null;
    let savedReceiptImagePath: string | null = null;
    let optimizedFileSize: number | null = null;
    let originalImageWidth: number | null = null;
    let originalImageHeight: number | null = null;
    let optimizedImageWidth: number | null = null;
    let optimizedImageHeight: number | null = null;
    let originalImageFormat: string | null = null;
    let optimizedImageFormat: string | null = null;
    let didOptimizeImage = false;
    let compressionIterations: number | null = null;
    let compressionQuality: number | null = null;
    let compressionTargetBytes: number | null = null;
    let compressionTargetReached = false;
    let savedReceiptMimeType: string | null = uploadedFile?.mimetype ?? null;
    let savedReceiptOriginalName: string | undefined = uploadedFile?.originalname;

    const imageInput: OCRImageInput = uploadedFile
      ? await (async () => {
          const optimizationDetails = await optimizeReceiptImageForOcr(uploadedFile.buffer);
          optimizedFileSize = optimizationDetails.optimizedBytes;
          originalImageWidth = optimizationDetails.originalWidth;
          originalImageHeight = optimizationDetails.originalHeight;
          optimizedImageWidth = optimizationDetails.optimizedWidth;
          optimizedImageHeight = optimizationDetails.optimizedHeight;
          originalImageFormat = optimizationDetails.originalFormat;
          optimizedImageFormat = optimizationDetails.optimizedFormat;
          didOptimizeImage = optimizationDetails.didOptimize;
          compressionIterations = optimizationDetails.compressionIterations;
          compressionQuality = optimizationDetails.compressionQuality;
          compressionTargetBytes = optimizationDetails.targetMaxBytes;
          compressionTargetReached = optimizationDetails.targetReached;
          savedReceiptMimeType = optimizationDetails.didOptimize ? optimizationDetails.mimeType : uploadedFile.mimetype ?? savedReceiptMimeType;
          savedReceiptOriginalName = optimizationDetails.didOptimize ? 'optimized-receipt.jpg' : uploadedFile.originalname;
          const savedImage = await saveReceiptProcessingImage({
            buffer: optimizationDetails.buffer,
            originalName: savedReceiptOriginalName,
            mimeType: savedReceiptMimeType ?? undefined,
            requestId,
            baseUrl: getPublicBaseUrl(req),
            label: 'scan',
          });
          savedReceiptImageUrl = savedImage.publicUrl;
          savedReceiptImagePath = savedImage.filePath;
          return {
            type: 'image-source' as const,
            value: savedImage.publicUrl,
          };
        })()
      : {
          type: 'image-source' as const,
          value: image as string,
        };

    // 1. Extract text using the OCR Service
    logger.info('Starting OCR extraction for receipt', {
      userId: req.user.id,
      transport: uploadedFile ? 'stored-url' : 'json',
      mimeType: uploadedFile?.mimetype ?? null,
      fileSize: uploadedFile?.size ?? (typeof image === 'string' ? image.length : null),
      optimizedFileSize,
      originalImageWidth,
      originalImageHeight,
      optimizedImageWidth,
      optimizedImageHeight,
      originalImageFormat,
      optimizedImageFormat,
      didOptimizeImage,
      compressionIterations,
      compressionQuality,
      compressionTargetBytes,
      compressionTargetReached,
      savedReceiptMimeType,
      requestId,
      savedReceiptImageUrl,
      savedReceiptImagePath,
    });
    const result = await analyzeReceiptImageForUser({
      userId: req.user.id,
      imageInput,
      requestId,
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn('Receipt scanning rejected', {
        userId: req.user.id,
        statusCode: error.statusCode,
        error: error.message,
      });
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    captureException(error, {
      controller: 'scanReceipt',
      userId: req.user.id,
      hasImage: Boolean(req.file || req.body?.image),
      transport: req.file ? 'multipart' : 'json',
      imagePayloadLength: typeof req.body?.image === 'string' ? req.body.image.length : req.file?.size ?? null,
      mimeType: req.file?.mimetype ?? null,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      userAgent: req.get('user-agent') ?? null,
      contentLength: req.get('content-length') ?? null,
    });
    logger.error('Receipt scanning failed', {
      userId: req.user.id,
      error,
    });
    
    res.status(500).json({ message: 'Failed to process receipt' });
  }
}

function getUploadedFiles(req: Request): UploadFileLike[] {
  const directFile = req.file as UploadFileLike | undefined;
  const files = req.files as UploadFileLike[] | Record<string, UploadFileLike[]> | undefined;

  if (directFile) {
    return [directFile];
  }

  if (Array.isArray(files)) {
    return files;
  }

  if (files && typeof files === 'object') {
    return Object.values(files).flat();
  }

  return [];
}

async function optimizeAndStoreReceiptFile(params: {
  file: UploadFileLike;
  requestId: string;
  baseUrl: string;
  label: string;
}) {
  const optimizationDetails = await optimizeReceiptImageForOcr(params.file.buffer);
  const mimeType = optimizationDetails.didOptimize
    ? optimizationDetails.mimeType
    : params.file.mimetype || 'application/octet-stream';
  const originalName = optimizationDetails.didOptimize
    ? 'optimized-receipt.jpg'
    : params.file.originalname;
  const savedImage = await saveReceiptProcessingImage({
    buffer: optimizationDetails.buffer,
    originalName,
    mimeType,
    requestId: params.requestId,
    baseUrl: params.baseUrl,
    label: params.label,
  });

  return {
    savedImage,
    optimizedBytes: optimizationDetails.optimizedBytes,
    mimeType,
    originalName: params.file.originalname,
  };
}

export async function queueReceiptAnalysis(req: Request, res: Response): Promise<void> {
  try {
    const uploadedFiles = getUploadedFiles(req);

    if (uploadedFiles.length === 0) {
      res.status(400).json({ message: 'No image files provided' });
      return;
    }

    const limitedFiles = uploadedFiles.slice(0, config.RECEIPT_BULK_UPLOAD_MAX_FILES);
    const baseUrl = getPublicBaseUrl(req);
    const timeZone = getRequestedTimeZone(req);
    const queuedFiles: Array<{
      publicUrl: string;
      filePath: string;
      fileName: string;
      originalName?: string;
      mimeType?: string;
      size: number;
      requestId?: string | null;
      timeZone?: string | null;
    }> = [];

    for (let index = 0; index < limitedFiles.length; index += 1) {
      const file = limitedFiles[index];
      const requestId = `${typeof res.locals.requestId === 'string' ? res.locals.requestId : 'queue'}-${index + 1}`;
      const { savedImage, optimizedBytes, mimeType, originalName } = await optimizeAndStoreReceiptFile({
        file,
        requestId,
        baseUrl,
        label: `queue-${index + 1}`,
      });

      queuedFiles.push({
        publicUrl: savedImage.publicUrl,
        filePath: savedImage.filePath,
        fileName: savedImage.fileName,
        originalName,
        mimeType,
        size: optimizedBytes,
        requestId,
        timeZone,
      });
    }

    const jobs = await ReceiptOcrQueueService.enqueueJobs(req.user.id, queuedFiles);

    res.status(202).json({
      jobs,
      queuedCount: jobs.length,
      skippedCount: Math.max(0, uploadedFiles.length - jobs.length),
    });
  } catch (error) {
    captureException(error, {
      controller: 'queueReceiptAnalysis',
      userId: req.user.id,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      fileCount: Array.isArray(req.files) ? req.files.length : req.file ? 1 : 0,
    });

    logger.error('Failed to queue receipt OCR jobs', {
      userId: req.user.id,
      error,
    });

    res.status(500).json({ message: 'Failed to queue receipt OCR jobs' });
  }
}

export async function getQueuedReceiptAnalysisJobs(req: Request, res: Response): Promise<void> {
  try {
    const rawIds = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = rawIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

    const jobs = ids.length > 0
      ? await ReceiptOcrQueueService.getJobsByIds(req.user.id, ids)
      : await ReceiptOcrQueueService.listJobsForUser(req.user.id, limit);

    res.status(200).json({ jobs });
  } catch (error) {
    captureException(error, {
      controller: 'getQueuedReceiptAnalysisJobs',
      userId: req.user.id,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
    });
    logger.error('Failed to fetch queued receipt OCR jobs', { userId: req.user.id, error });
    res.status(500).json({ message: 'Failed to fetch queued receipt OCR jobs' });
  }
}

export async function retryQueuedReceiptAnalysisJob(req: Request, res: Response): Promise<void> {
  try {
    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId : '';
    if (!jobId) {
      res.status(400).json({ message: 'Job ID is required' });
      return;
    }

    const job = await ReceiptOcrQueueService.retryJob(req.user.id, jobId);
    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }

    res.status(200).json({ job });
  } catch (error) {
    captureException(error, {
      controller: 'retryQueuedReceiptAnalysisJob',
      userId: req.user.id,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      jobId: req.params?.jobId ?? null,
    });
    logger.error('Failed to retry queued receipt OCR job', { userId: req.user.id, error, jobId: req.params?.jobId });
    res.status(500).json({ message: 'Failed to retry queued receipt OCR job' });
  }
}

export async function markQueuedReceiptAnalysisJobReviewed(req: Request, res: Response): Promise<void> {
  try {
    const jobId = typeof req.params.jobId === 'string' ? req.params.jobId : '';
    if (!jobId) {
      res.status(400).json({ message: 'Job ID is required' });
      return;
    }

    const requestedStatus =
      req.body?.reviewStatus === 'reviewed'
        ? 'reviewed'
        : req.body?.reviewStatus === 'dismissed'
          ? 'dismissed'
          : 'pending_review';
    const job = await ReceiptOcrQueueService.markReviewed(req.user.id, jobId, requestedStatus);

    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }

    res.status(200).json({ job });
  } catch (error) {
    captureException(error, {
      controller: 'markQueuedReceiptAnalysisJobReviewed',
      userId: req.user.id,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      jobId: req.params?.jobId ?? null,
    });
    logger.error('Failed to update queued receipt OCR job review status', { userId: req.user.id, error, jobId: req.params?.jobId });
    res.status(500).json({ message: 'Failed to update queued receipt OCR job review status' });
  }
}

export async function uploadReceiptSample(req: Request, res: Response): Promise<void> {
  try {
    const uploadedFile = req.file as
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size?: number;
        }
      | undefined;

    if (!uploadedFile) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }

    const source = sanitizeReceiptSource(req.body?.source);
    const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : 'no-request-id';
    const receiptSamplesDir = path.resolve(process.cwd(), 'public', 'receipt-samples');
    const extension = getImageExtension(uploadedFile.mimetype, uploadedFile.originalname);
    const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${source}-${requestId}${extension}`;
    const filePath = path.join(receiptSamplesDir, fileName);
    const metadataPath = path.join(receiptSamplesDir, `${fileName}.json`);

    await fs.mkdir(receiptSamplesDir, { recursive: true });
    await fs.writeFile(filePath, uploadedFile.buffer);
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          source,
          requestId,
          uploadedAt: new Date().toISOString(),
          originalName: uploadedFile.originalname ?? null,
          mimeType: uploadedFile.mimetype ?? null,
          size: uploadedFile.size ?? uploadedFile.buffer.length,
          userId: req.user.id,
          userAgent: req.get('user-agent') ?? null,
        },
        null,
        2
      )
    );

    const publicUrl = `${getPublicBaseUrl(req)}/receipt-samples/${fileName}`;
    const metadataUrl = `${publicUrl}.json`;

    logger.info('Stored receipt sample image for OCR debugging', {
      userId: req.user.id,
      source,
      requestId,
      fileName,
      fileSize: uploadedFile.size ?? uploadedFile.buffer.length,
      mimeType: uploadedFile.mimetype ?? null,
      publicUrl,
    });

    res.status(201).json({
      source,
      fileName,
      publicUrl,
      metadataUrl,
      savedTo: filePath,
    });
  } catch (error) {
    captureException(error, {
      controller: 'uploadReceiptSample',
      userId: req.user.id,
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      source: sanitizeReceiptSource(req.body?.source),
      hasFile: Boolean(req.file),
    });

    logger.error('Failed to store receipt sample image', {
      userId: req.user.id,
      error,
    });

    res.status(500).json({ message: 'Failed to store receipt sample image' });
  }
}

export async function getAISettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await AISettingsService.getSettings(req.user.id);
    res.status(200).json(settings);
  } catch (error) {
    captureException(error, {
      controller: 'getAISettings',
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      userId: req.user.id,
    });
    logger.error('Failed to get AI settings', { userId: req.user.id, error });
    res.status(500).json({ message: 'Failed to fetch AI settings' });
  }
}

export async function updateAISettings(req: Request, res: Response): Promise<void> {
  try {
    const { aiEnabled, aiProvider } = req.body;
    const settings = await AISettingsService.updateSettings(req.user.id, {
      aiEnabled,
      aiProvider,
    });
    res.status(200).json(settings);
  } catch (error) {
    captureException(error, {
      controller: 'updateAISettings',
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      userId: req.user.id,
      aiEnabled: req.body?.aiEnabled,
      aiProvider: req.body?.aiProvider,
    });
    logger.error('Failed to update AI settings', { userId: req.user.id, error });
    res.status(500).json({ message: 'Failed to update AI settings' });
  }
}

export async function analyzeTransactions(req: Request, res: Response): Promise<void> {
  try {
    const provider = await AIAssistantFactory.getProvider(req.user.id);
    
    if (!provider) {
      res.status(400).json({ message: 'AI Assistant is not enabled or provider not configured' });
      return;
    }

    // Fetch last 30 days of transactions for context
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId: req.user.id,
        date: { gte: thirtyDaysAgo },
      },
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 200,
    });

    if (transactions.length === 0) {
      res.status(200).json({ 
        categories: [], 
        trends: ['No transactions found in the last 30 days to analyze.'] 
      });
      return;
    }

    // Simplify data for the AI to save tokens and improve privacy
    const simplifiedData = transactions.map(t => ({
      date: t.date.toISOString().split('T')[0],
      amount: Number(t.amount),
      currency: t.currency,
      category: t.category?.name || 'Other',
      description: t.description,
      type: t.type === 'credit' ? 'income' : 'expense'
    }));

    const analysis = await provider.analyzeExpenses(simplifiedData);
    res.status(200).json(analysis);
  } catch (error) {
    captureException(error, {
      controller: 'analyzeTransactions',
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      userId: req.user.id,
    });
    logger.error('AI Analysis failed', { userId: req.user.id, error });
    res.status(500).json({ message: 'AI Analysis failed' });
  }
}

export async function getBudgetSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const provider = await AIAssistantFactory.getProvider(req.user.id);
    
    if (!provider) {
      res.status(400).json({ message: 'AI Assistant is not enabled or provider not configured' });
      return;
    }

    // Fetch transactions for context
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      take: 50,
      orderBy: { date: 'desc' },
      include: { category: true },
    });

    const suggestion = await provider.suggestBudget(transactions.map(t => ({
      amount: Number(t.amount),
      category: t.category?.name || 'Other',
      type: t.type === 'credit' ? 'income' : 'expense'
    })));

    res.status(200).json(suggestion);
  } catch (error) {
    logger.error('AI Budget suggestion failed', { userId: req.user.id, error });
    res.status(500).json({ message: 'Failed to get AI budget suggestions' });
  }
}
