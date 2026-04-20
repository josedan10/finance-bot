import { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { firebaseAdmin } from './firebase';
import { AppError } from './appError';
import { PrismaClient, User } from '@prisma/client';
import OnboardingService from '../services/onboarding.service';
import logger from './logger';

const prisma = new PrismaClient();
const DEFAULT_USER_ROLE = 'user';

export type AuthenticatedUser = User;

declare module 'express-serve-static-core' {
  interface Request {
    user: AuthenticatedUser;
    firebaseUser?: DecodedIdToken;
    file?: {
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    };
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401));
  }

  const idToken = authHeader.split('Bearer ')[1];

  if (!idToken) {
    logger.warn('Auth: Bearer token is empty');
    return next(new AppError('No token provided', 401));
  }

  try {
    // 1. Verify Firebase Token
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    logger.info('Auth: Token verified', { uid, email });

    // 2. Lookup User in Prisma (Source of truth for Roles)
    let user = await prisma.user.findUnique({
      where: { firebaseId: uid },
    });

    // 3. Auto-signup safety net (if user exists in Firebase but not in DB)
    if (!user) {
      logger.info('Auth: User not found in DB, creating...', { uid, email });
      try {
        const newUser = await prisma.user.create({
          data: {
            firebaseId: uid,
            email: email || `${uid}@zentra.local`, // Fallback email if not present
            role: DEFAULT_USER_ROLE,
          },
        });
        
        user = newUser;
        logger.info('Auth: DB User created, starting onboarding...', { userId: user.id });

        // Initialize default categories and payment methods for the new user
        // We do this in the background to not block the first request
        OnboardingService.setupUserDefaultCategories(newUser.id).catch((error) =>
          logger.error('Auth: Onboarding categories failed', { userId: newUser.id, error })
        );
        OnboardingService.setupUserDefaultPaymentMethods(newUser.id).catch((error) =>
          logger.error('Auth: Onboarding methods failed', { userId: newUser.id, error })
        );
      } catch (createError) {
        logger.error('Auth: Failed to auto-create user in DB', { uid, error: createError });
        // Try to find the user one last time in case of a race condition
        user = await prisma.user.findUnique({ where: { firebaseId: uid } });
      }
    }

    if (!user) {
      logger.error('Auth: User profile could not be retrieved or created', { uid });
      return next(new AppError('User profile not found in database', 403));
    }

    req.firebaseUser = decodedToken;
    req.user = user;
    next();
  } catch (error: unknown) {
    const authError = error instanceof Error ? error : new Error('Unauthorized');
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;

    logger.error('Auth: Token validation failed', {
      code: errorCode,
      message: authError.message,
      stack: authError.stack,
    });

    if (errorCode === 'auth/id-token-expired') {
      return next(new AppError('Token expired', 401));
    }
    return next(new AppError('Unauthorized', 401));
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const normalizedRole = req.user?.role?.trim();

    if (!req.user || !normalizedRole) {
      return next(new AppError('Unauthorized: Role not found', 403));
    }

    if (!roles.includes(normalizedRole)) {
      return next(new AppError('Forbidden: You do not have permission to perform this action', 403));
    }

    next();
  };
};
