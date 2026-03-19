import { Request, Response } from 'express';
import { AISettingsService, AIAssistantFactory } from '../../modules/ai-assistant/ai-assistant.module';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import logger from '../../src/lib/logger';
import { Image2TextService } from '../../modules/image-2-text/image-2-text.module';
import { BaseTransactions } from '../../modules/base-transactions/base-transactions.module';

export async function scanReceipt(req: Request, res: Response): Promise<void> {
  try {
    const { image } = req.body;

    if (!image) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }

    // 1. Extract text using the OCR Service
    logger.info('Starting OCR extraction for receipt', { userId: req.user.id });
    const extractedTexts = await Image2TextService.extractTextFromImages([image]);
    
    if (!extractedTexts || extractedTexts.length === 0) {
      res.status(422).json({ message: 'Could not extract text from image' });
      return;
    }

    // 2. Parse text into structured transaction data
    const textLines = extractedTexts[0].split('\n');
    const parsed = await BaseTransactions.parseTransactionFromText(textLines, req.user.id);

    // 3. Check for duplicates
    const duplicate = await BaseTransactions.findDuplicate({
      userId: req.user.id,
      amount: parsed.amount,
      date: new Date(parsed.date),
      type: parsed.type,
      currency: parsed.currency,
      description: parsed.description
    });

    res.status(200).json({
      ...parsed,
      isDuplicate: !!duplicate,
      duplicateId: duplicate?.id
    });
  } catch (error) {
    logger.error('Receipt scanning failed', { 
      userId: req.user.id, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    if (error instanceof Error && error.message === 'Amount not found') {
      res.status(422).json({ message: 'Could not find a valid amount in the receipt' });
      return;
    }

    res.status(500).json({ message: 'Failed to process receipt' });
  }
}

export async function getAISettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await AISettingsService.getSettings(req.user.id);
    res.status(200).json(settings);
  } catch (error) {
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
