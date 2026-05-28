import { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { firebaseAdmin } from './firebase';
import { AppError } from './appError';
import { PrismaClient, User } from '@prisma/client';
import logger from './logger';

const prisma = new PrismaClient();
const DEFAULT_USER_ROLE = 'user';
const ONBOARDING_STATUS_APPROVED = 'approved';
const ONBOARDING_STATUS_PENDING = 'pending';

export type AuthenticatedUser = Pick<User, 'id' | 'email'> & Partial<User>;

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

    // 2. Lookup User in Prisma (Source of truth for roles and onboarding access)
    const user = await prisma.user.findUnique({
      where: { firebaseId: uid },
    });

    if (!user) {
      logger.warn('Auth: Firebase user not approved in DB', { uid, email });
      return next(new AppError('Access pending approval. Please contact support.', 403));
    }

    if ((user.onboardingStatus || '').toLowerCase() !== ONBOARDING_STATUS_APPROVED) {
      logger.warn('Auth: User exists but is not approved', {
        userId: user.id,
        uid,
        onboardingStatus: user.onboardingStatus,
      });
      return next(new AppError('Access pending approval. Please contact support.', 403));
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

export const requireOnboardingSyncAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401));
  }

  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) {
    return next(new AppError('No token provided', 401));
  }

  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    let user = await prisma.user.findUnique({
      where: { firebaseId: uid },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseId: uid,
          email: email || `${uid}@zentra.local`,
          role: DEFAULT_USER_ROLE,
          onboardingStatus: ONBOARDING_STATUS_PENDING,
          approvalRequestedAt: new Date(),
        },
      });
      logger.info('Auth: Created pending onboarding user', { userId: user.id, uid });
    } else if ((user.onboardingStatus || '').toLowerCase() === ONBOARDING_STATUS_APPROVED && !user.approvedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          approvedAt: new Date(),
        },
      });
    }

    req.firebaseUser = decodedToken;
    req.user = user;
    next();
  } catch (error: unknown) {
    const authError = error instanceof Error ? error : new Error('Unauthorized');
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;

    logger.error('Auth: Onboarding token validation failed', {
      code: errorCode,
      message: authError.message,
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
