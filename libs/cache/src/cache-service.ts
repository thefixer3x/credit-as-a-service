import pino from 'pino';
import { RedisClient } from './redis-client.js';

const logger = pino({ name: 'cache-service' });

export interface CacheEntry<T = any> {
  value: T;
  ttl?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
}

export class CacheService {
  private redisClient: RedisClient;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0
  };

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const client = this.redisClient.getClient();
      const value = await client.get(key);
      
      if (value === null) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();
      
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      let result: string;
      if (ttlSeconds) {
        result = await client.setex(key, ttlSeconds, serializedValue);
      } else {
        result = await client.set(key, serializedValue);
      }

      this.stats.sets++;
      return result === 'OK';
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, ttlSeconds }, 'Cache set error');
      return false;
    }
  }

  /**
   * Set multiple values
   */
  async mset(entries: Record<string, any>, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const pipeline = client.pipeline();
      
      for (const [key, value] of Object.entries(entries)) {
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        if (ttlSeconds) {
          pipeline.setex(key, ttlSeconds, serializedValue);
        } else {
          pipeline.set(key, serializedValue);
        }
      }

      const results = await pipeline.exec();
      this.stats.sets += Object.keys(entries).length;
      
      return results?.every(([err, result]) => err === null && result === 'OK') || false;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, entries: Object.keys(entries) }, 'Cache mset error');
      return false;
    }
  }

  /**
   * Get multiple values
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const client = this.redisClient.getClient();
      const values = await client.mget(...keys);
      
      return values.map((value, index) => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;
        
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, keys }, 'Cache mget error');
      return keys.map(() => null);
    } finally {
      this.updateHitRate();
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const result = await client.del(key);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache delete error');
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  async mdel(keys: string[]): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      const result = await client.del(...keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, keys }, 'Cache mdel error');
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const result = await client.exists(key);
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const result = await client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, ttlSeconds }, 'Cache expire error');
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.ttl(key);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache ttl error');
      return -1;
    }
  }

  /**
   * Increment counter
   */
  async incr(key: string, increment: number = 1): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.incrby(key, increment);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, increment }, 'Cache incr error');
      return 0;
    }
  }

  /**
   * Decrement counter
   */
  async decr(key: string, decrement: number = 1): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.decrby(key, decrement);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, decrement }, 'Cache decr error');
      return 0;
    }
  }

  /**
   * Add to set
   */
  async sadd(key: string, members: string[]): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.sadd(key, ...members);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, members }, 'Cache sadd error');
      return 0;
    }
  }

  /**
   * Get set members
   */
  async smembers(key: string): Promise<string[]> {
    try {
      const client = this.redisClient.getClient();
      return await client.smembers(key);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache smembers error');
      return [];
    }
  }

  /**
   * Remove from set
   */
  async srem(key: string, members: string[]): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.srem(key, ...members);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, members }, 'Cache srem error');
      return 0;
    }
  }

  /**
   * Push to list
   */
  async lpush(key: string, values: string[]): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.lpush(key, ...values);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, values }, 'Cache lpush error');
      return 0;
    }
  }

  /**
   * Pop from list
   */
  async lpop(key: string): Promise<string | null> {
    try {
      const client = this.redisClient.getClient();
      return await client.lpop(key);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache lpop error');
      return null;
    }
  }

  /**
   * Get list range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      const client = this.redisClient.getClient();
      return await client.lrange(key, start, stop);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, start, stop }, 'Cache lrange error');
      return [];
    }
  }

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: any): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const result = await client.hset(key, field, serializedValue);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, field }, 'Cache hset error');
      return false;
    }
  }

  /**
   * Get hash field
   */
  async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      const client = this.redisClient.getClient();
      const value = await client.hget(key, field);
      
      if (value === null) return null;
      
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, field }, 'Cache hget error');
      return null;
    }
  }

  /**
   * Get all hash fields
   */
  async hgetall<T = any>(key: string): Promise<Record<string, T> | null> {
    try {
      const client = this.redisClient.getClient();
      const result = await client.hgetall(key);
      
      if (Object.keys(result).length === 0) return null;
      
      const parsed: Record<string, T> = {};
      for (const [field, value] of Object.entries(result)) {
        try {
          parsed[field] = JSON.parse(value) as T;
        } catch {
          parsed[field] = value as T;
        }
      }
      
      return parsed;
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache hgetall error');
      return null;
    }
  }

  /**
   * Delete hash field
   */
  async hdel(key: string, fields: string[]): Promise<number> {
    try {
      const client = this.redisClient.getClient();
      return await client.hdel(key, ...fields);
    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key, fields }, 'Cache hdel error');
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  async flushall(): Promise<boolean> {
    try {
      const client = this.redisClient.getClient();
      const result = await client.flushall();
      return result === 'OK';
    } catch (error) {
      this.stats.errors++;
      logger.error({ error }, 'Cache flushall error');
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0
    };
  }

  /**
   * Get or set pattern - cache aside
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T | null> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    try {
      // Fetch from source
      const value = await fetcher();
      if (value !== null && value !== undefined) {
        // Store in cache
        await this.set(key, value, ttlSeconds);
      }
      return value;
    } catch (error) {
      logger.error({ error, key }, 'Cache getOrSet fetcher error');
      return null;
    }
  }

  /**
   * Cache warming - preload cache with data
   */
  async warm(entries: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>): Promise<void> {
    const pipeline = this.redisClient.getClient().pipeline();
    
    for (const { key, fetcher, ttl } of entries) {
      try {
        const value = await fetcher();
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        if (ttl) {
          pipeline.setex(key, ttl, serializedValue);
        } else {
          pipeline.set(key, serializedValue);
        }
      } catch (error) {
        logger.error({ error, key }, 'Cache warming error for key');
      }
    }

    try {
      await pipeline.exec();
      logger.info({ count: entries.length }, 'Cache warming completed');
    } catch (error) {
      logger.error({ error }, 'Cache warming pipeline error');
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}