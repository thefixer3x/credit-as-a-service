import Redis, { RedisOptions, Cluster, ClusterOptions } from 'ioredis';
import pino from 'pino';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'redis-client' });
const env = validateEnv();

export interface SessionConfig {
  ttlSeconds: number;
  extendOnAccess: boolean;
  maxSessions: number;
  sessionKeyPrefix: string;
  userSessionsPrefix: string;
}

export interface CacheConfig {
  host: string;
  port: string;
  password?: string;
  db: string;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  connectTimeout: number;
  commandTimeout: number;
  lazyConnect: boolean;
  enableAutoPipelining: boolean;
  enableCluster: boolean;
  clusterNodes?: Array<{ host: string; port: number }>;
  enableTLS: boolean;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
  maxMemoryPolicy: string;
  enableOfflineQueue: boolean;
  keepAlive: number;
  connectionPoolSize: number;
}

export class RedisClient {
  private client!: Redis | Cluster;
  private subscriber!: Redis | Cluster;
  private publisher!: Redis | Cluster;
  private isConnected: boolean = false;
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    const defaultConfig: CacheConfig = {
      host: (env as any).REDIS_HOST || 'localhost',
      port: String((env as any).REDIS_PORT || '6379'),
      password: (env as any).REDIS_PASSWORD,
      db: (env as any).REDIS_DB || '0',
      keyPrefix: (env as any).REDIS_KEY_PREFIX || 'caas:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      connectTimeout: 10000,
      commandTimeout: 5000,
      lazyConnect: true,
      enableAutoPipelining: true,
      enableCluster: (env as any).REDIS_CLUSTER_ENABLED === 'true',
      clusterNodes: (env as any).REDIS_CLUSTER_NODES ? 
        JSON.parse((env as any).REDIS_CLUSTER_NODES) : undefined,
      enableTLS: (env as any).REDIS_TLS_ENABLED === 'true',
      tlsCert: (env as any).REDIS_TLS_CERT,
      tlsKey: (env as any).REDIS_TLS_KEY,
      tlsCa: (env as any).REDIS_TLS_CA,
      maxMemoryPolicy: (env as any).REDIS_MAX_MEMORY_POLICY || 'allkeys-lru',
      enableOfflineQueue: true,
      keepAlive: 1,
      connectionPoolSize: parseInt((env as any).REDIS_POOL_SIZE || '10', 10)
    };

    this.config = { ...defaultConfig, ...config };
    
    if (this.config.enableCluster && this.config.clusterNodes) {
      this.initializeCluster();
    } else {
      this.initializeSingleNode();
    }

    this.setupEventListeners();
  }

  private initializeSingleNode(): void {
    const redisUrl = `redis://${this.config.host}:${this.config.port}/${this.config.db}`;
    const redisOptions = this.getRedisOptions();

    // Create main client
    this.client = new Redis(redisUrl, redisOptions);
    
    // Create subscriber client
    this.subscriber = new Redis(redisUrl, redisOptions);
    
    // Create publisher client
    this.publisher = new Redis(redisUrl, redisOptions);
  }

  private initializeCluster(): void {
    if (!this.config.clusterNodes) {
      throw new Error('Cluster nodes must be specified when cluster mode is enabled');
    }

    const clusterOptions: ClusterOptions = {
      ...this.getRedisOptions(),
      enableOfflineQueue: this.config.enableOfflineQueue,
      scaleReads: 'slave'
    };

    // Create cluster clients
    this.client = new Cluster(this.config.clusterNodes, clusterOptions);
    this.subscriber = new Cluster(this.config.clusterNodes, clusterOptions);
    this.publisher = new Cluster(this.config.clusterNodes, clusterOptions);
  }

  private getRedisOptions(): RedisOptions {
    const options: RedisOptions = {
      password: this.config.password,
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
      lazyConnect: this.config.lazyConnect,
      enableAutoPipelining: this.config.enableAutoPipelining,
      family: 4,
      keepAlive: this.config.keepAlive,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn({ times, delay }, 'Redis connection retry');
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      }
    };

    // Add TLS configuration if enabled
    if (this.config.enableTLS) {
      options.tls = {
        cert: this.config.tlsCert,
        key: this.config.tlsKey,
        ca: this.config.tlsCa
      };
    }

    return options;
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
  getClient(): Redis | Cluster {
    return this.client;
  }

  /**
   * Get subscriber instance
   */
  getSubscriber(): Redis | Cluster {
    return this.subscriber;
  }

  /**
   * Get publisher instance
   */
  getPublisher(): Redis | Cluster {
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