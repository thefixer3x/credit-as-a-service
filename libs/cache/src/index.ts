// Redis client exports
export { RedisClient, createRedisClient, getRedisClient } from './redis-client.js';
export type { CacheConfig } from './redis-client.js';

// Cache service exports
export { CacheService } from './cache-service.js';
export type { CacheEntry, CacheStats } from './cache-service.js';

// Session service exports
export { SessionService } from './session-service.js';
export type { SessionData, SessionConfig } from './session-service.js';

// Convenience factory functions
import { createRedisClient } from './redis-client.js';
import { CacheService } from './cache-service.js';
import { SessionService } from './session-service.js';
import type { CacheConfig, SessionConfig } from './redis-client.js';

/**
 * Initialize complete cache infrastructure
 */
export async function initializeCache(config?: {
  redis?: Partial<CacheConfig>;
  session?: Partial<SessionConfig>;
}) {
  // Create Redis client
  const redisClient = createRedisClient(config?.redis);
  await redisClient.connect();

  // Create cache service
  const cacheService = new CacheService(redisClient);

  // Create session service
  const sessionService = new SessionService(cacheService, config?.session);

  return {
    redisClient,
    cacheService,
    sessionService
  };
}

/**
 * Cache decorators for method-level caching
 */
export function Cache(keyPrefix: string, ttlSeconds?: number) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;
      
      // Try to get from cache first
      const cacheService = this.cacheService || global.cacheService;
      if (cacheService) {
        const cached = await cacheService.get(cacheKey);
        if (cached !== null) {
          return cached;
        }
      }

      // Execute original method
      const result = await method.apply(this, args);

      // Store in cache
      if (cacheService && result !== null && result !== undefined) {
        await cacheService.set(cacheKey, result, ttlSeconds);
      }

      return result;
    };
  };
}

/**
 * Cache invalidation decorator
 */
export function CacheInvalidate(keyPattern: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Execute original method
      const result = await method.apply(this, args);

      // Invalidate cache
      const cacheService = this.cacheService || global.cacheService;
      if (cacheService) {
        // Note: This is a simplified implementation
        // Production would need Redis SCAN with pattern matching
        const cacheKey = keyPattern.replace(/\$(\d+)/g, (match, index) => {
          return args[parseInt(index) - 1];
        });
        await cacheService.del(cacheKey);
      }

      return result;
    };
  };
}