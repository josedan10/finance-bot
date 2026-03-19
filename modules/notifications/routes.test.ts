import request from 'supertest';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotificationFactory } from './notification.module';
import { PrismaModule } from '../database/database.module';

import app from '../../app';

// Mock the auth middleware
jest.mock('../../src/lib/auth.middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  },
  requireRole: (_roles: string[]) => (req: any, res: any, next: any) => {
    req.user = { id: 1, email: 'test@example.com', role: 'admin' };
    next();
  },
}));

// Mock the config
jest.mock('../../src/config', () => ({
  config: {
    VAPID_PUBLIC_KEY: 'test-public-key',
  },
}));

// Mock the services
jest.mock('./notification.module', () => ({
  NotificationFactory: {
    getPreferenceService: jest.fn(),
    getWebPushService: jest.fn(),
  },
}));

jest.mock('../database/database.module', () => ({
  PrismaModule: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockNF = NotificationFactory as any;
const mockPrisma = PrismaModule as any;

describe('Notifications API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/notifications/preferences', () => {
    it('should return 200 and preferences if they exist', async () => {
      const mockPreferences = {
        emailEnabled: true,
        webPushEnabled: true,
        thresholds: '[50, 75, 95]',
        disabledCategories: '[1, 2]',
      };

      mockNF.getPreferenceService.mockReturnValue({
        getPreferences: jest.fn<any>().mockResolvedValue(mockPreferences),
      });

      const response = await request(app).get('/api/notifications/preferences');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        emailEnabled: true,
        webPushEnabled: true,
        thresholds: [50, 75, 95],
        disabledCategories: [1, 2],
      });
    });

    it('should return default preferences if none exist', async () => {
      mockNF.getPreferenceService.mockReturnValue({
        getPreferences: jest.fn<any>().mockResolvedValue(null),
      });

      const response = await request(app).get('/api/notifications/preferences');

      expect(response.status).toBe(200);
      expect(response.body.thresholds).toEqual([50, 70, 90]);
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    it('should update preferences and return 200', async () => {
      const updatedPrefs = {
        emailEnabled: false,
        webPushEnabled: true,
        thresholds: '[60, 80]',
        disabledCategories: '[]',
      };

      mockNF.getPreferenceService.mockReturnValue({
        updatePreferences: jest.fn<any>().mockResolvedValue(updatedPrefs),
      });

      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ emailEnabled: false, webPushEnabled: true, thresholds: [60, 80] });

      expect(response.status).toBe(200);
      expect(response.body.emailEnabled).toBe(false);
      expect(response.body.thresholds).toEqual([60, 80]);
    });
  });

  describe('POST /api/notifications/test', () => {
    it('should send a test notification and return 200', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
      });

      const response = await request(app).post('/api/notifications/test');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
      expect(response.body.email).toBe('test@example.com');
    });
  });
});
