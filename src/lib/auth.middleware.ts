import { Request, Response, NextFunction } from 'express';
import { firebaseAdmin } from './firebase';
import { AppError } from './appError';
import { PrismaClient } from '@prisma/client';
import { redisClient } from './redis';

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
  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    idToken = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.session) {
    idToken = req.cookies.session;
  }

  if (!idToken) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

    const cacheKey = `auth_user:${decodedToken.uid}`;
    let user;
    const cachedUser = await redisClient.get(cacheKey);

    if (cachedUser) {
      user = JSON.parse(cachedUser);
    } else {
      user = await prisma.user.findUnique({
        where: { firebaseId: decodedToken.uid }
      });

      if (!user) {
        if (!decodedToken.email) {
          return next(new AppError('Firebase user must have an email', 400));
        }
        user = await prisma.user.create({
          data: {
            firebaseId: decodedToken.uid,
            email: decodedToken.email,
          }
        });
      }

      // Cache user details for 15 minutes (900 seconds)
      await redisClient.set(cacheKey, JSON.stringify(user), 900);
    }

    req.firebaseUser = decodedToken;
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return next(new AppError('Invalid token or token has expired', 401));
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
