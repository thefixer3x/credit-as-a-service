// Redis client exports
export { RedisClient, createRedisClient, getRedisClient } from './redis-client.js';
export type { CacheConfig } from './redis-client.js';

// Cache service exports
export { CacheService } from './cache-service.js';
export type { CacheEntry, CacheStats } from './cache-service.js';

// Session service exports
export { SessionService } from './session-service.js';
export type { SessionData, SessionConfig } from './session-service.js';

// Credit cache service exports
export { CreditCacheService } from './credit-cache-service.js';
export type { 
  CreditScore,
  CreditApplication,
  CreditLimit
} from './credit-cache-service.js';

// Rate limiting service exports
export { RateLimitingService } from './rate-limiting-service.js';
export type { 
  RateLimitRule,
  RateLimitResult,
  RateLimitConfig
} from './rate-limiting-service.js';

// API cache service exports
export { ApiCacheService } from './api-cache-service.js';
export type { 
  ApiCacheConfig,
  CachedResponse,
  CacheRule
} from './api-cache-service.js';

// Cache monitoring service exports
export { CacheMonitoringService } from './cache-monitoring-service.js';
export type { 
  CacheMetrics,
  CacheHealthStatus,
  AlertRule,
  Alert
} from './cache-monitoring-service.js';

// Cache invalidation service exports
export { CacheInvalidationService } from './cache-invalidation-service.js';
export type { 
  InvalidationEvent,
  InvalidationRule,
  InvalidationStats
} from './cache-invalidation-service.js';

// Cache middleware exports
export {
  apiCacheMiddleware,
  rateLimitMiddleware,
  sessionMiddleware,
  cacheHeadersMiddleware,
  cacheInvalidationMiddleware,
  createCacheMiddleware,
  CacheAwareRequest
} from './cache-middleware.js';
export type { CacheMiddlewareConfig } from './cache-middleware.js';

// Configuration exports
export {
  loadCacheConfig,
  validateCacheConfig,
  getServiceConfigs,
  initializeCacheConfig
} from './config/cache-config.js';
export type {
  EnvironmentConfig,
  CacheConfigServices
} from './config/cache-config.js';

// Convenience factory functions
import { createRedisClient } from './redis-client.js';
import { CacheService } from './cache-service.js';
import { SessionService } from './session-service.js';
import { CreditCacheService } from './credit-cache-service.js';
import { RateLimitingService } from './rate-limiting-service.js';
import { ApiCacheService } from './api-cache-service.js';
import { CacheMonitoringService } from './cache-monitoring-service.js';
import { CacheInvalidationService } from './cache-invalidation-service.js';
import type { 
  CacheConfig, 
  SessionConfig
} from './redis-client.js';
import type { RateLimitConfig } from './rate-limiting-service.js';
import type { ApiCacheConfig } from './api-cache-service.js';

/**
 * Initialize complete cache infrastructure
 */
export async function initializeCache(config?: {
  redis?: Partial<CacheConfig>;
  session?: Partial<SessionConfig>;
  rateLimit?: Partial<RateLimitConfig>;
  apiCache?: Partial<ApiCacheConfig>;
  enableMonitoring?: boolean;
  enableInvalidation?: boolean;
}) {
  // Create Redis client
  const redisClient = createRedisClient(config?.redis);
  await redisClient.connect();

  // Create core cache service
  const cacheService = new CacheService(redisClient);

  // Create session service
  const sessionService = new SessionService(cacheService, config?.session);

  // Create specialized cache services
  const creditCacheService = new CreditCacheService(cacheService);
  const rateLimitingService = new RateLimitingService(cacheService, config?.rateLimit);
  const apiCacheService = new ApiCacheService(cacheService, config?.apiCache);

  // Optional monitoring service
  let monitoringService: CacheMonitoringService | undefined;
  if (config?.enableMonitoring !== false) {
    monitoringService = new CacheMonitoringService(cacheService, redisClient);
  }

  // Optional invalidation service
  let invalidationService: CacheInvalidationService | undefined;
  if (config?.enableInvalidation !== false) {
    invalidationService = new CacheInvalidationService(cacheService, redisClient);
  }

  return {
    redisClient,
    cacheService,
    sessionService,
    creditCacheService,
    rateLimitingService,
    apiCacheService,
    monitoringService,
    invalidationService
  };
}

/**
 * Initialize cache with production-ready configuration
 */
export async function initializeProdCache(config?: {
  redis?: Partial<CacheConfig>;
  session?: Partial<SessionConfig>;
}) {
  return initializeCache({
    ...config,
    enableMonitoring: true,
    enableInvalidation: true,
    rateLimit: {
      enableBlocking: true,
      defaultWindowSize: 60,
      defaultMaxRequests: 1000
    },
    apiCache: {
      defaultTTL: 300,
      enableCompression: true,
      maxCacheSize: 1024 * 1024 // 1MB
    }
  });
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
      const cacheService = (this as any).cacheService || (global as any).cacheService;
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
      const cacheService = (this as any).cacheService || (global as any).cacheService;
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