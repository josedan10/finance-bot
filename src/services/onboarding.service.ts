import { PrismaModule as prisma } from '../../modules/database/database.module';
import { CATEGORIES } from '../enums/paymentMethods';
import logger from '../lib/logger';

export class OnboardingService {
	async setupUserDefaultCategories(userId: number) {
		try {
			logger.info('Setting up default categories for user', { userId });

			for (const categoryData of Object.values(CATEGORIES)) {
				
				// Define some default limits
				const categoryLimits: Record<string, number> = {
					'Food & Dining': 500,
					'Transportation': 200,
					'Shopping': 300,
					'Entertainment': 150,
					'Bills & Utilities': 400,
					'Health & Fitness': 100,
					'Travel': 0,
					'Education': 0,
					'Other': 100,
				};

				const limit = categoryLimits[categoryData.name] ?? 0;

				// Create the category
				const category = await prisma.category.upsert({
					where: {
						name_userId: {
							name: categoryData.name,
							userId,
						},
					},
					update: {},
					create: {
						name: categoryData.name,
						userId,
						amountLimit: limit,
						description: `Default category for ${categoryData.name}`,
					},
				});

				// Add default keywords if they exist
				if ('keywords' in categoryData && categoryData.keywords && categoryData.keywords.length > 0) {
					for (const keywordName of categoryData.keywords) {
						// Create the keyword for this user
						const keyword = await prisma.keyword.upsert({
							where: {
								name_userId: {
									name: keywordName.toLowerCase(),
									userId,
								},
							},
							update: {},
							create: {
								name: keywordName.toLowerCase(),
								userId,
							},
						});

						// Link keyword to category
						await prisma.categoryKeyword.upsert({
							where: {
								categoryId_keywordId: {
									categoryId: category.id,
									keywordId: keyword.id,
								},
							},
							update: {},
							create: {
								categoryId: category.id,
								keywordId: keyword.id,
							},
						});
					}
				}
			}

			logger.info('Default categories setup complete', { userId });
		} catch (error) {
			logger.error('Failed to setup default categories', { userId, error });
		}
	}

	async setupUserDefaultPaymentMethods(userId: number) {
		try {
			logger.info('Setting up default payment methods for user', { userId });

			const defaults = ['Cash', 'Bank Account'];

			for (const name of defaults) {
				await prisma.paymentMethod.upsert({
					where: {
						name_userId: {
							name,
							userId,
						},
					},
					update: {},
					create: {
						name,
						userId,
					},
				});
			}

			logger.info('Default payment methods setup complete', { userId });
		} catch (error) {
			logger.error('Failed to setup default payment methods', { userId, error });
		}
	}
}

export default new OnboardingService();
