import pino from 'pino';
import { CacheService } from './cache-service.js';

const logger = pino({ name: 'rate-limiting-service' });

export interface RateLimitRule {
  identifier: string; // IP, user ID, API key, etc.
  windowSizeSeconds: number;
  maxRequests: number;
  blockDurationSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export interface RateLimitConfig {
  keyPrefix: string;
  defaultWindowSize: number;
  defaultMaxRequests: number;
  defaultBlockDuration: number;
  enableBlocking: boolean;
}

export class RateLimitingService {
  private cache: CacheService;
  private config: RateLimitConfig;

  constructor(cache: CacheService, config?: Partial<RateLimitConfig>) {
    this.cache = cache;
    this.config = {
      keyPrefix: 'rate_limit:',
      defaultWindowSize: 60, // 1 minute
      defaultMaxRequests: 100,
      defaultBlockDuration: 300, // 5 minutes
      enableBlocking: true,
      ...config
    };
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkRateLimit(
    identifier: string,
    rule?: Partial<RateLimitRule>
  ): Promise<RateLimitResult> {
    try {
      const effectiveRule: RateLimitRule = {
        identifier,
        windowSizeSeconds: rule?.windowSizeSeconds || this.config.defaultWindowSize,
        maxRequests: rule?.maxRequests || this.config.defaultMaxRequests,
        blockDurationSeconds: rule?.blockDurationSeconds || this.config.defaultBlockDuration
      };

      // Check if identifier is currently blocked
      if (this.config.enableBlocking) {
        const isBlocked = await this.isBlocked(identifier);
        if (isBlocked) {
          const blockExpiry = await this.getBlockExpiry(identifier);
          return {
            allowed: false,
            limit: effectiveRule.maxRequests,
            remaining: 0,
            resetTime: blockExpiry,
            retryAfter: Math.ceil((blockExpiry.getTime() - Date.now()) / 1000)
          };
        }
      }

      // Sliding window rate limiting using sorted sets
      const result = await this.slidingWindowRateLimit(effectiveRule);
      
      // If limit exceeded and blocking is enabled, block the identifier
      if (!result.allowed && this.config.enableBlocking && effectiveRule.blockDurationSeconds) {
        await this.blockIdentifier(identifier, effectiveRule.blockDurationSeconds);
        result.retryAfter = effectiveRule.blockDurationSeconds;
      }

      return result;
    } catch (error) {
      logger.error({ error, identifier }, 'Rate limit check failed');
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        limit: this.config.defaultMaxRequests,
        remaining: this.config.defaultMaxRequests,
        resetTime: new Date(Date.now() + this.config.defaultWindowSize * 1000)
      };
    }
  }

  /**
   * Sliding window rate limiting implementation
   */
  private async slidingWindowRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - (rule.windowSizeSeconds * 1000);
    const key = this.getRateLimitKey(rule.identifier);

    const client = this.cache.getClient();
    
    // Use Redis pipeline for atomic operations
    const pipeline = client.pipeline();
    
    // Remove expired entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Get count of requests in window
    pipeline.zcard(key);
    
    // Set expiration
    pipeline.expire(key, rule.windowSizeSeconds * 2);
    
    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Pipeline execution failed');
    }

    const requestCount = results[2][1] as number;
    const allowed = requestCount <= rule.maxRequests;
    const remaining = Math.max(0, rule.maxRequests - requestCount);
    const resetTime = new Date(now + rule.windowSizeSeconds * 1000);

    if (!allowed) {
      logger.warn({
        identifier: rule.identifier,
        requestCount,
        limit: rule.maxRequests,
        windowSize: rule.windowSizeSeconds
      }, 'Rate limit exceeded');
    }

    return {
      allowed,
      limit: rule.maxRequests,
      remaining,
      resetTime
    };
  }

  /**
   * Token bucket rate limiting implementation (alternative approach)
   */
  async tokenBucketRateLimit(
    identifier: string,
    bucketSize: number,
    refillRate: number,
    tokensRequested: number = 1
  ): Promise<RateLimitResult> {
    try {
      const key = this.getTokenBucketKey(identifier);
      const now = Date.now();

      // Lua script for atomic token bucket operations
      const luaScript = `
        local key = KEYS[1]
        local bucket_size = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local tokens_requested = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])
        
        local bucket_data = redis.call('HMGET', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket_data[1]) or bucket_size
        local last_refill = tonumber(bucket_data[2]) or now
        
        -- Calculate tokens to add based on time elapsed
        local time_elapsed = (now - last_refill) / 1000
        local tokens_to_add = math.floor(time_elapsed * refill_rate)
        tokens = math.min(bucket_size, tokens + tokens_to_add)
        
        local allowed = tokens >= tokens_requested
        if allowed then
          tokens = tokens - tokens_requested
        end
        
        -- Update bucket state
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600) -- 1 hour expiry
        
        return {allowed and 1 or 0, tokens, bucket_size}
      `;

      const client = this.cache.getClient();
      const result = await client.eval(
        luaScript,
        1,
        key,
        bucketSize.toString(),
        refillRate.toString(),
        tokensRequested.toString(),
        now.toString()
      ) as [number, number, number];

      const [allowed, remainingTokens, limit] = result;
      const resetTime = new Date(now + ((limit - remainingTokens) / refillRate) * 1000);

      return {
        allowed: allowed === 1,
        limit,
        remaining: remainingTokens,
        resetTime
      };
    } catch (error) {
      logger.error({ error, identifier }, 'Token bucket rate limit failed');
      // Fail open
      return {
        allowed: true,
        limit: bucketSize,
        remaining: bucketSize,
        resetTime: new Date(Date.now() + 60000)
      };
    }
  }

  /**
   * Block an identifier for a specified duration
   */
  async blockIdentifier(identifier: string, durationSeconds: number): Promise<void> {
    try {
      const key = this.getBlockKey(identifier);
      const expiry = new Date(Date.now() + durationSeconds * 1000);
      
      await this.cache.set(key, expiry.toISOString(), durationSeconds);
      
      logger.warn({
        identifier,
        durationSeconds,
        expiresAt: expiry.toISOString()
      }, 'Identifier blocked due to rate limit violation');
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to block identifier');
    }
  }

  /**
   * Check if identifier is currently blocked
   */
  async isBlocked(identifier: string): Promise<boolean> {
    try {
      const key = this.getBlockKey(identifier);
      const blockExpiry = await this.cache.get<string>(key);
      
      if (!blockExpiry) return false;
      
      const expiryDate = new Date(blockExpiry);
      return expiryDate > new Date();
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to check if identifier is blocked');
      return false;
    }
  }

  /**
   * Get block expiry time for identifier
   */
  async getBlockExpiry(identifier: string): Promise<Date> {
    try {
      const key = this.getBlockKey(identifier);
      const blockExpiry = await this.cache.get<string>(key);
      
      if (blockExpiry) {
        return new Date(blockExpiry);
      }
      
      return new Date();
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to get block expiry');
      return new Date();
    }
  }

  /**
   * Unblock an identifier
   */
  async unblockIdentifier(identifier: string): Promise<boolean> {
    try {
      const key = this.getBlockKey(identifier);
      const result = await this.cache.del(key);
      
      if (result) {
        logger.info({ identifier }, 'Identifier unblocked');
      }
      
      return result;
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to unblock identifier');
      return false;
    }
  }

  /**
   * Get rate limit status for identifier
   */
  async getRateLimitStatus(
    identifier: string,
    rule?: Partial<RateLimitRule>
  ): Promise<{
    currentRequests: number;
    limit: number;
    remaining: number;
    resetTime: Date;
    isBlocked: boolean;
    blockExpiry?: Date;
  }> {
    try {
      const effectiveRule: RateLimitRule = {
        identifier,
        windowSizeSeconds: rule?.windowSizeSeconds || this.config.defaultWindowSize,
        maxRequests: rule?.maxRequests || this.config.defaultMaxRequests,
        blockDurationSeconds: rule?.blockDurationSeconds || this.config.defaultBlockDuration
      };

      const now = Date.now();
      const windowStart = now - (effectiveRule.windowSizeSeconds * 1000);
      const key = this.getRateLimitKey(identifier);

      // Get current request count
      const client = this.cache.getClient();
      await client.zremrangebyscore(key, 0, windowStart);
      const currentRequests = await client.zcard(key);

      const remaining = Math.max(0, effectiveRule.maxRequests - currentRequests);
      const resetTime = new Date(now + effectiveRule.windowSizeSeconds * 1000);

      // Check if blocked
      const isBlocked = await this.isBlocked(identifier);
      const blockExpiry = isBlocked ? await this.getBlockExpiry(identifier) : undefined;

      return {
        currentRequests,
        limit: effectiveRule.maxRequests,
        remaining,
        resetTime,
        isBlocked,
        blockExpiry
      };
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to get rate limit status');
      throw error;
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async resetRateLimit(identifier: string): Promise<boolean> {
    try {
      const keys = [
        this.getRateLimitKey(identifier),
        this.getTokenBucketKey(identifier),
        this.getBlockKey(identifier)
      ];

      const deletedCount = await this.cache.mdel(keys);
      
      logger.info({ identifier, deletedKeys: deletedCount }, 'Rate limit reset');
      return deletedCount > 0;
    } catch (error) {
      logger.error({ error, identifier }, 'Failed to reset rate limit');
      return false;
    }
  }

  /**
   * Get rate limiting statistics
   */
  async getRateLimitStats(): Promise<{
    totalRequests: number;
    blockedIdentifiers: number;
    activeRateLimits: number;
  }> {
    try {
      // This would require Redis SCAN in production for accurate counts
      return {
        totalRequests: 0,
        blockedIdentifiers: 0,
        activeRateLimits: 0
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get rate limit stats');
      return {
        totalRequests: 0,
        blockedIdentifiers: 0,
        activeRateLimits: 0
      };
    }
  }

  /**
   * Cleanup expired rate limit entries (maintenance task)
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      // Redis handles expiration automatically, but we can clean up sorted sets
      // This would be implemented with SCAN in production
      logger.info('Rate limit cleanup completed (Redis auto-expiration)');
      return 0;
    } catch (error) {
      logger.error({ error }, 'Rate limit cleanup failed');
      return 0;
    }
  }

  // Private helper methods for cache keys
  private getRateLimitKey(identifier: string): string {
    return `${this.config.keyPrefix}limit:${identifier}`;
  }

  private getTokenBucketKey(identifier: string): string {
    return `${this.config.keyPrefix}bucket:${identifier}`;
  }

  private getBlockKey(identifier: string): string {
    return `${this.config.keyPrefix}block:${identifier}`;
  }
}