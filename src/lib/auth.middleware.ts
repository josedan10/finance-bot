import { Request, Response, NextFunction } from 'express';
import { firebaseAdmin } from './firebase';
import { AppError } from './appError';
import { PrismaClient } from '@prisma/client';
import { redisClient } from './redis';
import OnboardingService from '../services/onboarding.service';

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      user?: any;
      firebaseUser?: any;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  // BYPASS AUTH FOR TESTING
  // Always use a dummy user. We use a fixed firebaseId for the primary tester.
  const DUMMY_FIREBASE_ID = 'test-user-123';
  const DUMMY_EMAIL = 'test@financebot.com';

  try {
    let user = await prisma.user.findUnique({
      where: { firebaseId: DUMMY_FIREBASE_ID }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseId: DUMMY_FIREBASE_ID,
          email: DUMMY_EMAIL,
        }
      });
      
      // Automatic onboarding for the new dummy user
      await OnboardingService.setupUserDefaultCategories(user.id);
    }

    req.firebaseUser = { uid: DUMMY_FIREBASE_ID, email: DUMMY_EMAIL };
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth bypass error:', error);
    return next(new AppError('Failed to initialize dummy user', 500));
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      return next(new AppError('Unauthorized: Role not found', 403));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Forbidden: You do not have permission to perform this action', 403));
    }

    next();
  };
};
