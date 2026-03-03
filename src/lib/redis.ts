import { createClient, RedisClientType } from 'redis';
import logger from './logger';
import { config } from '../config';

class RedisService {
  private client: RedisClientType | null = null;
  private isConnecting: boolean = false;

  constructor() {
    // Initialize without connecting immediately.
  }

  async getClient(): Promise<RedisClientType> {
    if (this.client && this.client.isOpen) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait a bit if already connecting to avoid multiple connection attempts
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getClient();
    }

    try {
      this.isConnecting = true;
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url: redisUrl,
      }) as RedisClientType;

      this.client.on('error', (err) => {
        logger.error('Redis Client Error', err);
      });

      this.client.on('connect', () => {
        logger.info('Connected to Redis');
      });

      this.client.on('reconnecting', () => {
        logger.info('Reconnecting to Redis');
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      return await client.get(key);
    } catch (error) {
      logger.error(`Error getting key ${key} from Redis`, error);
      return null; // Fail gracefully
    }
  }

  async set(key: string, value: string, expirationSeconds?: number): Promise<void> {
    try {
      const client = await this.getClient();
      if (expirationSeconds) {
        await client.setEx(key, expirationSeconds, value);
      } else {
        await client.set(key, value);
      }
    } catch (error) {
      logger.error(`Error setting key ${key} in Redis`, error);
      // Fail gracefully
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.del(key);
    } catch (error) {
      logger.error(`Error deleting key ${key} from Redis`, error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.disconnect();
      logger.info('Disconnected from Redis');
    }
  }
}

export const redisClient = new RedisService();
