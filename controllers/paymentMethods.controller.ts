import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaModule as prisma } from '../modules/database/database.module';
import logger from '../src/lib/logger';

/**
 * Returns all payment methods for the authenticated user.
 */
export async function getPaymentMethods(req: Request, res: Response): Promise<void> {
	try {
		const paymentMethods = await prisma.paymentMethod.findMany({
			where: { userId: req.user.id },
			include: {
				_count: {
					select: { transaction: true }
				}
			},
			orderBy: { name: 'asc' }
		});

		const mapped = paymentMethods.map((pm) => ({
			id: pm.id,
			name: pm.name,
			transactionCount: pm._count.transaction,
		}));

		res.status(200).json(mapped);
	} catch (error) {
		logger.error('Failed to fetch payment methods', { userId: req.user.id, error });
		res.status(500).json({ message: 'Failed to fetch payment methods' });
	}
}

/**
 * Creates a new payment method.
 */
export async function createPaymentMethod(req: Request, res: Response): Promise<void> {
	const { name } = req.body as { name: string };

	if (!name) {
		res.status(400).json({ message: 'Payment method name is required' });
		return;
	}

	try {
		const paymentMethod = await prisma.paymentMethod.create({
			data: {
				name,
				userId: req.user.id,
			}
		});

		res.status(201).json(paymentMethod);
	} catch (error: unknown) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
			res.status(400).json({ message: 'A payment method with this name already exists' });
			return;
		}
		logger.error('Failed to create payment method', { userId: req.user.id, error });
		res.status(500).json({ message: 'Failed to create payment method' });
	}
}

/**
 * Updates an existing payment method.
 */
export async function updatePaymentMethod(req: Request, res: Response): Promise<void> {
	const id = Number(req.params.id);
	const { name } = req.body as { name?: string };

	if (isNaN(id)) {
		res.status(400).json({ message: 'Invalid payment method ID' });
		return;
	}

	try {
		// Verify ownership
		const existing = await prisma.paymentMethod.findFirst({
			where: { id, userId: req.user.id }
		});

		if (!existing) {
			res.status(404).json({ message: 'Payment method not found' });
			return;
		}

		const updated = await prisma.paymentMethod.update({
			where: { id },
			data: {
				name: name ?? existing.name,
			}
		});

		res.status(200).json(updated);
	} catch (error: unknown) {
		logger.error('Failed to update payment method', { userId: req.user.id, id, error });
		res.status(500).json({ message: 'Failed to update payment method' });
	}
}

/**
 * Deletes a payment method. Transactions are moved to "Other" or "Cash"?
 * We'll use a safe deletion strategy similar to categories.
 */
export async function deletePaymentMethod(req: Request, res: Response): Promise<void> {
	const id = Number(req.params.id);

	if (isNaN(id)) {
		res.status(400).json({ message: 'Invalid payment method ID' });
		return;
	}

	try {
		await prisma.$transaction(async (tx) => {
			// Verify ownership
			const paymentMethod = await tx.paymentMethod.findFirst({
				where: { id, userId: req.user.id }
			});

			if (!paymentMethod) {
				throw new Error('Payment method not found');
			}

			if (paymentMethod.name === 'Cash') {
				throw new Error('Cannot delete the default Cash payment method');
			}

			// 1. Find or create the "Cash" method for this user
			let cashMethod = await tx.paymentMethod.findFirst({
				where: { name: 'Cash', userId: req.user.id }
			});

			if (!cashMethod) {
				cashMethod = await tx.paymentMethod.create({
					data: {
						name: 'Cash',
						userId: req.user.id,
					}
				});
			}

			// 2. Re-associate transactions
			await tx.transaction.updateMany({
				where: { paymentMethodId: id, userId: req.user.id },
				data: { paymentMethodId: cashMethod.id }
			});

			// 3. Delete the method
			await tx.paymentMethod.delete({
				where: { id }
			});
		});

		res.status(204).send();
	} catch (error: unknown) {
		if (error instanceof Error && error.message === 'Payment method not found') {
			res.status(404).json({ message: error.message });
			return;
		}
		if (error instanceof Error && error.message === 'Cannot delete the default Cash payment method') {
			res.status(400).json({ message: error.message });
			return;
		}
		logger.error('Failed to delete payment method', { userId: req.user.id, id, error });
		res.status(500).json({ message: 'Failed to delete payment method' });
	}
}
