import { promises as fs } from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { AISettingsService, AIAssistantFactory } from '../../modules/ai-assistant/ai-assistant.module';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import logger from '../../src/lib/logger';
import { AppError } from '../../src/lib/appError';
import { getImageExtension, saveReceiptProcessingImage } from '../../src/lib/receipt-image-storage';
import { captureException } from '../../src/lib/sentry';
import { Image2TextService } from '../../modules/image-2-text/image-2-text.module';
import { BaseTransactions } from '../../modules/base-transactions/base-transactions.module';
import {
  getBeloWithdrawCommissionFromGross,
  getBeloWithdrawGrossFromReceiptAmount,
  isBeloWithdrawDescription,
} from '../../src/helpers/belo-withdraw.helper';

function formatMetadataDateTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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

async function findMatchingBeloWithdraw(userId: number, parsed: {
  amount: number;
  date: string;
  currency: string;
}) {
  const receiptDate = new Date(parsed.date);
  const dayStart = new Date(receiptDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(receiptDate);
  dayEnd.setHours(23, 59, 59, 999);
  const expectedGrossAmount = getBeloWithdrawGrossFromReceiptAmount(parsed.amount);

  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'debit',
      currency: parsed.currency,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
    orderBy: { date: 'desc' },
  });

  const withdrawCandidates = candidates.filter((transaction) => isBeloWithdrawDescription(transaction.description));

  if (withdrawCandidates.length === 0) {
    return null;
  }

  const bestMatch = withdrawCandidates
    .map((transaction) => {
      const grossAmount = Number(transaction.amount || 0);
      return {
        transaction,
        amountDifference: Math.abs(grossAmount - expectedGrossAmount),
      };
    })
    .sort((left, right) => left.amountDifference - right.amountDifference)[0];

  if (!bestMatch || bestMatch.amountDifference > 5) {
    return null;
  }

  const grossAmount = Number(bestMatch.transaction.amount || 0);

  return {
    id: bestMatch.transaction.id,
    date: bestMatch.transaction.date.toISOString(),
    description: bestMatch.transaction.description,
    grossAmount,
    expectedNetAmount: parsed.amount,
    commissionAmount: getBeloWithdrawCommissionFromGross(grossAmount),
  };
}

export async function scanReceipt(req: Request, res: Response): Promise<void> {
  try {
    const uploadedFile = req.file as
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size?: number;
        }
      | undefined;
    const image = typeof req.body?.image === 'string' ? req.body.image : null;

    if (!uploadedFile && !image) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }

    const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : 'no-request-id';
    let savedReceiptImageUrl: string | null = null;
    let savedReceiptImagePath: string | null = null;

    const imageInput = uploadedFile
      ? await (async () => {
          const savedImage = await saveReceiptProcessingImage({
            buffer: uploadedFile.buffer,
            originalName: uploadedFile.originalname,
            mimeType: uploadedFile.mimetype,
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
      requestId,
      savedReceiptImageUrl,
      savedReceiptImagePath,
    });
    const extractedTexts = await Image2TextService.extractTextFromImages([imageInput]);
    
    if (!extractedTexts || extractedTexts.length === 0) {
      res.status(422).json({ message: 'Could not extract text from image' });
      return;
    }

    const extractedReceipt = extractedTexts[0];
    const textLines = extractedReceipt.text.split('\n');
    let parsed: Awaited<ReturnType<typeof BaseTransactions.parseTransactionFromText>> | null = null;
    let duplicate = null;
    let beloWithdrawMatch = null;
    let requiresManualReview = true;
    let parseWarning: string | null = null;

    try {
      parsed = await BaseTransactions.parseTransactionFromText(textLines, req.user.id);
      requiresManualReview = false;

      duplicate = await BaseTransactions.findDuplicate({
        userId: req.user.id,
        amount: parsed.amount,
        date: new Date(parsed.date),
        type: parsed.type,
        currency: parsed.currency,
        description: parsed.description
      });

      beloWithdrawMatch = await findMatchingBeloWithdraw(req.user.id, {
        amount: parsed.amount,
        date: parsed.date,
        currency: parsed.currency,
      });
    } catch (parseError) {
      parseWarning = parseError instanceof Error ? parseError.message : 'Could not parse receipt fields automatically';
      logger.warn('Receipt OCR extracted text but automatic parsing needs manual review', {
        userId: req.user.id,
        warning: parseWarning,
      });
    }

    res.status(200).json({
      ...(parsed ?? {}),
      isDuplicate: !!duplicate,
      duplicateId: duplicate?.id,
      beloWithdrawMatch,
      rawText: extractedReceipt.text,
      textLines,
      requiresManualReview,
      parseWarning,
      imageMetadata: extractedReceipt.metadata,
      metadataDateTimeSuggestion: formatMetadataDateTime(extractedReceipt.metadata?.capturedAt),
    });
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
