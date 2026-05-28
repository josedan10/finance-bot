import { Request, Response, NextFunction } from 'express';
import { requireAuth, requireOnboardingSyncAuth, requireRole } from './auth.middleware';
import { firebaseAdmin } from './firebase';
import { PrismaClient } from '@prisma/client';

const verifyIdToken = jest.fn();

// Mock dependencies
jest.mock('./firebase', () => ({
  firebaseAdmin: {
    auth: () => ({
      verifyIdToken,
    }),
  },
}));

jest.mock('@prisma/client', () => {
  const mPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrisma) };
});

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
    const mockDbUser = {
      id: 1,
      firebaseId: 'test-uid',
      email: 'test@example.com',
      role: 'user',
      onboardingStatus: 'approved',
    };

    req.headers!.authorization = 'Bearer valid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockDbUser);

    await requireAuth(req as Request, res as Response, next);

    expect(req.user).toEqual(mockDbUser);
    expect(req.firebaseUser).toEqual(mockDecodedToken);
    expect(next).toHaveBeenCalledWith();
  });

  it('should reject access when token is valid but user is missing in DB', async () => {
    const mockDecodedToken = { uid: 'new-uid', email: 'new@example.com' };

    req.headers!.authorization = 'Bearer valid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await requireAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Access pending approval. Please contact support.' })
    );
  });

  it('should reject access when user is pending approval', async () => {
    const mockDecodedToken = { uid: 'pending-uid', email: 'pending@example.com' };
    const pendingUser = {
      id: 3,
      firebaseId: 'pending-uid',
      email: 'pending@example.com',
      role: 'user',
      onboardingStatus: 'pending',
    };

    req.headers!.authorization = 'Bearer valid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(pendingUser);

    await requireAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Access pending approval. Please contact support.' })
    );
  });

  it('should create a pending user through onboarding sync middleware', async () => {
    const mockDecodedToken = { uid: 'signup-uid', email: 'signup@example.com' };
    const pendingUser = {
      id: 4,
      firebaseId: 'signup-uid',
      email: 'signup@example.com',
      role: 'user',
      onboardingStatus: 'pending',
    };

    req.headers!.authorization = 'Bearer valid-token';
    (firebaseAdmin.auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(pendingUser);

    await requireOnboardingSyncAuth(req as Request, res as Response, next);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firebaseId: 'signup-uid',
        email: 'signup@example.com',
        onboardingStatus: 'pending',
      }),
    });
    expect(req.user).toEqual(pendingUser);
    expect(next).toHaveBeenCalledWith();
  });

  it('should reject role-protected access when user role is missing', () => {
    req.user = { id: 1, firebaseId: 'uid', email: 'test@example.com' } as Request['user'];

    requireRole(['dev'])(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, message: 'Unauthorized: Role not found' }));
  });

  it('should reject role-protected access when user role is not allowed', () => {
    req.user = { id: 1, firebaseId: 'uid', email: 'test@example.com', role: 'user' } as Request['user'];

    requireRole(['dev'])(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Forbidden: You do not have permission to perform this action' })
    );
  });

  it('should allow role-protected access when user role is allowed', () => {
    req.user = { id: 1, firebaseId: 'uid', email: 'test@example.com', role: 'dev' } as Request['user'];

    requireRole(['dev'])(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
