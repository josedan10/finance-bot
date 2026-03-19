import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaModule as prisma } from '../modules/database/database.module';
import logger from '../src/lib/logger';
import { BudgetRollover } from '../modules/budgets/budget-rollover.service';

const normalizeKeywords = (keywords: string[]): string[] =>
	[...new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];

type CategoryWithOptionalIcon = {
	icon?: string | null;
};

/**
 * Returns all categories for the authenticated user, 
 * including their keywords and transaction counts.
 */
export async function getCategories(req: Request, res: Response): Promise<void> {
	try {
		logger.info('API: Fetching categories', { userId: req.user.id });
		const categories = await prisma.category.findMany({
			where: { userId: req.user.id },
			include: {
				categoryKeyword: {
					include: {
						keyword: true,
					},
				},
				_count: {
					select: { transaction: true }
				}
			},
			orderBy: { name: 'asc' }
		});

		const mapped = await Promise.all(categories.map(async (cat) => {
			const period = await BudgetRollover.getOrCreateCurrentPeriod(cat.id);
			return {
				id: cat.id,
				name: cat.name,
				description: cat.description,
				icon: (cat as unknown as CategoryWithOptionalIcon).icon ?? null,
				amountLimit: Number(cat.amountLimit ?? 0),
				isCumulative: cat.isCumulative,
				currentCarryOver: Number(period?.carryOver || 0),
				keywords: cat.categoryKeyword.map((ck) => ck.keyword.name),
				transactionCount: cat._count.transaction,
			};
		}));

		res.status(200).json(mapped);
	} catch (error) {
		logger.error('Failed to fetch categories', { userId: req.user.id, error });
		res.status(500).json({ message: 'Failed to fetch categories' });
	}
}

/**
 * Creates a new category and associates keywords.
 */
export async function createCategory(req: Request, res: Response): Promise<void> {
	const { name, description, icon, amountLimit, keywords, isCumulative } = req.body as {
		name: string;
		description?: string;
		icon?: string;
		amountLimit?: number;
		keywords?: string[];
		isCumulative?: boolean;
	};

	if (!name) {
		res.status(400).json({ message: 'Category name is required' });
		return;
	}

	try {
		logger.info('API: Creating category', { userId: req.user.id, name });
		const result = await prisma.$transaction(async (tx) => {
			// 1. Create the category
			const categoryCreateData = {
					name,
					description,
					icon: icon ?? null,
					amountLimit,
					isCumulative: !!isCumulative,
					userId: req.user.id,
				};
			const category = await tx.category.create({
				data: categoryCreateData as never
			});

			// 2. Handle keywords if provided
			if (keywords && Array.isArray(keywords)) {
				const normalizedKeywords = normalizeKeywords(keywords);
				for (const kwName of normalizedKeywords) {
					const keyword = await tx.keyword.upsert({
						where: {
							name_userId: {
								name: kwName,
								userId: req.user.id,
							}
						},
						update: {},
						create: {
							name: kwName,
							userId: req.user.id,
						}
					});

					await tx.categoryKeyword.create({
						data: {
							categoryId: category.id,
							keywordId: keyword.id,
						}
					});
				}
			}

			return category;
		});

		res.status(201).json(result);
	} catch (error: unknown) {
		const prismaError = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : undefined;
		logger.error('API: Failed to create category', { userId: req.user.id, error: errorMessage, stack: errorStack });
		if (prismaError?.code === 'P2002') {
			res.status(400).json({ message: 'A category with this name already exists' });
			return;
		}
		logger.error('Failed to create category', { userId: req.user.id, error });
		res.status(500).json({ message: 'Failed to create category' });
	}
}

/**
 * Updates an existing category and its keywords.
 */
export async function updateCategory(req: Request, res: Response): Promise<void> {
	const id = Number(req.params.id);
	const { name, description, icon, amountLimit, keywords, isCumulative } = req.body as {
		name?: string;
		description?: string;
		icon?: string;
		amountLimit?: number;
		keywords?: string[];
		isCumulative?: boolean;
	};

	if (isNaN(id)) {
		res.status(400).json({ message: 'Invalid category ID' });
		return;
	}

	try {
		logger.info('API: Updating category', { userId: req.user.id, id, name });
		const result = await prisma.$transaction(async (tx) => {
			// Verify ownership
			const existing = await tx.category.findFirst({
				where: { id, userId: req.user.id }
			});

			if (!existing) {
				throw new Error('Category not found');
			}

			// 1. Update category fields
			const categoryUpdateData = {
						name: name ?? existing.name,
						description: description !== undefined ? description : existing.description,
						icon: icon !== undefined ? icon : (existing as unknown as CategoryWithOptionalIcon).icon,
						amountLimit: amountLimit !== undefined ? amountLimit : existing.amountLimit,
						isCumulative: isCumulative !== undefined ? isCumulative : existing.isCumulative,
					};
			const updatedCategory = await tx.category.update({
				where: { id },
				data: categoryUpdateData as never
			});

			// 2. Update keywords if provided
			if (keywords && Array.isArray(keywords)) {
				const normalizedKeywords = normalizeKeywords(keywords);
				// Remove old associations
				await tx.categoryKeyword.deleteMany({
					where: { categoryId: id }
				});

				// Create new ones
				for (const kwName of normalizedKeywords) {
					const keyword = await tx.keyword.upsert({
						where: {
							name_userId: {
								name: kwName,
								userId: req.user.id,
							}
						},
						update: {},
						create: {
							name: kwName,
							userId: req.user.id,
						}
					});

					await tx.categoryKeyword.create({
						data: {
							categoryId: id,
							keywordId: keyword.id,
						}
					});
				}
			}

			return updatedCategory;
		});

		res.status(200).json(result);
	} catch (error: unknown) {
		if (error instanceof Error && error.message === 'Category not found') {
			res.status(404).json({ message: error.message });
			return;
		}
		logger.error('Failed to update category', { userId: req.user.id, id, error });
		res.status(500).json({ message: 'Failed to update category' });
	}
}

/**
 * Deletes a category. Transactions are moved to "Other".
 */
export async function deleteCategory(req: Request, res: Response): Promise<void> {
	const id = Number(req.params.id);

	if (isNaN(id)) {
		res.status(400).json({ message: 'Invalid category ID' });
		return;
	}

	try {
		await prisma.$transaction(async (tx) => {
			// Verify ownership and ensure it's not the "Other" category
			const category = await tx.category.findFirst({
				where: { id, userId: req.user.id }
			});

			if (!category) {
				throw new Error('Category not found');
			}

			if (category.name === 'Other') {
				throw new Error('Cannot delete the default Other category');
			}

			// 1. Find or create the "Other" category for this user
			let otherCategory = await tx.category.findFirst({
				where: { name: 'Other', userId: req.user.id }
			});

			if (!otherCategory) {
				otherCategory = await tx.category.create({
					data: {
						name: 'Other',
						userId: req.user.id,
						description: 'Default category for unclassified transactions'
					}
				});
			}

			// 2. Re-associate transactions
			await tx.transaction.updateMany({
				where: { categoryId: id, userId: req.user.id },
				data: { categoryId: otherCategory.id }
			});

			// 3. Remove keyword associations
			await tx.categoryKeyword.deleteMany({
				where: { categoryId: id }
			});

			// 4. Delete the category
			await tx.category.delete({
				where: { id }
			});
		});

		res.status(204).send();
	} catch (error: unknown) {
		if (error instanceof Error && error.message === 'Category not found') {
			res.status(404).json({ message: error.message });
			return;
		}
		if (error instanceof Error && error.message === 'Cannot delete the default Other category') {
			res.status(400).json({ message: error.message });
			return;
		}
		logger.error('Failed to delete category', { userId: req.user.id, id, error });
		res.status(500).json({ message: 'Failed to delete category' });
	}
}

// Keep the old function for backward compatibility until frontend is fully migrated
export async function getCategoriesWithKeywords(req: Request, res: Response): Promise<void> {
	return getCategories(req, res);
}
