import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth.middleware';
import { firebaseAdmin } from './firebase';
import { PrismaClient } from '@prisma/client';
import OnboardingService from '../services/onboarding.service';

// Mock dependencies
jest.mock('./firebase', () => ({
  firebaseAdmin: {
    auth: () => ({
      verifyIdToken: jest.fn(),
    }),
  },
}));

jest.mock('@prisma/client', () => {
  const mPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrisma) };
});

jest.mock('../services/onboarding.service', () => ({
  setupUserDefaultCategories: jest.fn(),
}));

describe('Auth Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  const prisma = new PrismaClient();

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 401 if no authorization header is present', async () => {
    await requireAuth(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'No token provided' }));
  });

  it('should return 401 if token is invalid or expired', async () => {
    req.headers!.authorization = 'Bearer invalid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockRejectedValue(new Error('Invalid token'));

    await requireAuth(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: 'Unauthorized' }));
  });

  it('should proceed and attach user if token and DB user are valid', async () => {
    const mockDecodedToken = { uid: 'test-uid', email: 'test@example.com' };
    const mockDbUser = { id: 1, firebaseId: 'test-uid', email: 'test@example.com', role: 'user' };

    req.headers!.authorization = 'Bearer valid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockDbUser);

    await requireAuth(req as Request, res as Response, next);

    expect(req.user).toEqual(mockDbUser);
    expect(req.firebaseUser).toEqual(mockDecodedToken);
    expect(next).toHaveBeenCalledWith();
  });

  it('should auto-create user and onboarding if token is valid but user missing in DB', async () => {
    const mockDecodedToken = { uid: 'new-uid', email: 'new@example.com' };
    const mockCreatedUser = { id: 2, firebaseId: 'new-uid', email: 'new@example.com', role: 'user' };

    req.headers!.authorization = 'Bearer valid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockCreatedUser);

    await requireAuth(req as Request, res as Response, next);

    expect(prisma.user.create).toHaveBeenCalled();
    expect(OnboardingService.setupUserDefaultCategories).toHaveBeenCalledWith(2);
    expect(req.user).toEqual(mockCreatedUser);
    expect(next).toHaveBeenCalledWith();
  });
});
