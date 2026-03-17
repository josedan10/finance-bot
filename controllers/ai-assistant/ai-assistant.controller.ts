import { Request, Response } from 'express';
import { AISettingsService, AIAssistantFactory } from '../../modules/ai-assistant/ai-assistant.module';
import { PrismaModule as prisma } from '../../modules/database/database.module';
import logger from '../../src/lib/logger';

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
