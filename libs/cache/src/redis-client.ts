import Redis, { RedisOptions } from 'ioredis';
import pino from 'pino';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'redis-client' });
const env = validateEnv();

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  connectTimeout: number;
  commandTimeout: number;
  lazyConnect: boolean;
  enableAutoPipelining: boolean;
}

export class RedisClient {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private isConnected: boolean = false;

  constructor(config?: Partial<CacheConfig>) {
    const defaultConfig: CacheConfig = {
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT || '6379'),
      password: env.REDIS_PASSWORD,
      db: parseInt(env.REDIS_DB || '0'),
      keyPrefix: env.REDIS_KEY_PREFIX || 'caas:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      connectTimeout: 10000,
      commandTimeout: 5000,
      lazyConnect: true,
      enableAutoPipelining: true
    };

    const finalConfig = { ...defaultConfig, ...config };
    const redisOptions: RedisOptions = {
      host: finalConfig.host,
      port: finalConfig.port,
      password: finalConfig.password,
      db: finalConfig.db,
      keyPrefix: finalConfig.keyPrefix,
      maxRetriesPerRequest: finalConfig.maxRetriesPerRequest,
      retryDelayOnFailover: finalConfig.retryDelayOnFailover,
      connectTimeout: finalConfig.connectTimeout,
      commandTimeout: finalConfig.commandTimeout,
      lazyConnect: finalConfig.lazyConnect,
      enableAutoPipelining: finalConfig.enableAutoPipelining,
      // Connection pool settings
      family: 4,
      keepAlive: true,
      // Retry strategy
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn({ times, delay }, 'Redis connection retry');
        return delay;
      },
      // Reconnect on error
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      }
    };

    // Create main client
    this.client = new Redis(redisOptions);
    
    // Create subscriber client
    this.subscriber = new Redis(redisOptions);
    
    // Create publisher client
    this.publisher = new Redis(redisOptions);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Main client events
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis client error');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    // Subscriber events
    this.subscriber.on('error', (error) => {
      logger.error({ error }, 'Redis subscriber error');
    });

    // Publisher events
    this.publisher.on('error', (error) => {
      logger.error({ error }, 'Redis publisher error');
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);
      logger.info('All Redis connections established');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.disconnect(),
        this.subscriber.disconnect(),
        this.publisher.disconnect()
      ]);
      logger.info('All Redis connections closed');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from Redis');
      throw error;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get subscriber instance
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get publisher instance
   */
  getPublisher(): Redis {
    return this.publisher;
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; latency: number }> {
    try {
      const start = Date.now();
      const result = await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        status: result === 'PONG' ? 'healthy' : 'unhealthy',
        latency
      };
    } catch (error) {
      logger.error({ error }, 'Redis health check failed');
      return {
        status: 'unhealthy',
        latency: -1
      };
    }
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<any> {
    try {
      const info = await this.client.info();
      return this.parseRedisInfo(info);
    } catch (error) {
      logger.error({ error }, 'Failed to get Redis info');
      throw error;
    }
  }

  private parseRedisInfo(info: string): any {
    const lines = info.split('\r\n');
    const result: any = {};
    let section = '';

    for (const line of lines) {
      if (line.startsWith('#')) {
        section = line.substring(2).toLowerCase();
        result[section] = {};
      } else if (line && line.includes(':')) {
        const [key, value] = line.split(':');
        if (section) {
          result[section][key] = isNaN(Number(value)) ? value : Number(value);
        }
      }
    }

    return result;
  }
}

// Singleton instance
let redisClient: RedisClient | null = null;

export function createRedisClient(config?: Partial<CacheConfig>): RedisClient {
  if (!redisClient) {
    redisClient = new RedisClient(config);
  }
  return redisClient;
}

export function getRedisClient(): RedisClient {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
}