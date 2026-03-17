import { Request, Response } from 'express';
import { PrismaModule as prisma } from '../modules/database/database.module';
import logger from '../src/lib/logger';

export async function getCategoriesWithKeywords(req: Request, res: Response): Promise<void> {
	try {
		const categories = await prisma.category.findMany({
			where: { userId: req.user.id },
			include: {
				categoryKeyword: {
					include: {
						keyword: true,
					},
				},
			},
		});

		const mapped = categories.map((cat: any) => ({
			name: cat.name,
			keywords: cat.categoryKeyword.map((ck: any) => ck.keyword.name),
		}));

		res.status(200).json(mapped);
	} catch (error) {
		logger.error('Failed to fetch categories with keywords', { userId: req.user.id, error });
		res.status(500).json({ message: 'Failed to fetch categories' });
	}
}
