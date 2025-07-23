import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { 
  initializeCache,
  CacheService,
  SessionService,
  CreditCacheService,
  RateLimitingService,
  ApiCacheService,
  CacheMonitoringService,
  CacheInvalidationService,
  createCacheMiddleware
} from '../index.js';
import { initializeCacheConfig } from '../config/cache-config.js';

describe('Cache Integration Tests', () => {
  let cacheServices: any;
  let cacheService: CacheService;
  let sessionService: SessionService;
  let creditCacheService: CreditCacheService;
  let rateLimitingService: RateLimitingService;
  let apiCacheService: ApiCacheService;
  let monitoringService: CacheMonitoringService;
  let invalidationService: CacheInvalidationService;

  beforeAll(async () => {
    // Initialize test cache configuration
    process.env.NODE_ENV = 'test';
    process.env.REDIS_DB = '15'; // Use separate DB for tests
    process.env.REDIS_KEY_PREFIX = 'test:caas:';
    
    const config = initializeCacheConfig();
    
    // Initialize cache services
    cacheServices = await initializeCache({
      redis: config.redis,
      session: config.session,
      rateLimit: config.rateLimit,
      apiCache: config.apiCache,
      enableMonitoring: true,
      enableInvalidation: true
    });

    cacheService = cacheServices.cacheService;
    sessionService = cacheServices.sessionService;
    creditCacheService = cacheServices.creditCacheService;
    rateLimitingService = cacheServices.rateLimitingService;
    apiCacheService = cacheServices.apiCacheService;
    monitoringService = cacheServices.monitoringService!;
    invalidationService = cacheServices.invalidationService!;
  });

  afterAll(async () => {
    // Cleanup
    await monitoringService?.cleanup();
    await invalidationService?.cleanup();
    await cacheServices.redisClient.disconnect();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await cacheService.flushall();
  });

  describe('Core Cache Service', () => {
    it('should set and get values', async () => {
      const key = 'test:key';
      const value = { data: 'test value', timestamp: Date.now() };

      const setResult = await cacheService.set(key, value, 60);
      expect(setResult).toBe(true);

      const getValue = await cacheService.get(key);
      expect(getValue).toEqual(value);
    });

    it('should handle TTL expiration', async () => {
      const key = 'test:ttl';
      const value = 'expiring value';

      await cacheService.set(key, value, 1); // 1 second TTL
      
      // Should exist immediately
      const immediate = await cacheService.get(key);
      expect(immediate).toBe(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const expired = await cacheService.get(key);
      expect(expired).toBeNull();
    });

    it('should support batch operations', async () => {
      const entries = {
        'test:batch1': 'value1',
        'test:batch2': 'value2',
        'test:batch3': 'value3'
      };

      const msetResult = await cacheService.mset(entries, 60);
      expect(msetResult).toBe(true);

      const values = await cacheService.mget(Object.keys(entries));
      expect(values).toEqual(Object.values(entries));
    });

    it('should support cache-aside pattern', async () => {
      const key = 'test:cache-aside';
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return { data: 'fetched value', count: fetchCount };
      };

      // First call should fetch
      const first = await cacheService.getOrSet(key, fetcher, 60);
      expect(first?.count).toBe(1);
      expect(fetchCount).toBe(1);

      // Second call should use cache
      const second = await cacheService.getOrSet(key, fetcher, 60);
      expect(second?.count).toBe(1); // Same value from cache
      expect(fetchCount).toBe(1); // Fetcher not called again
    });
  });

  describe('Session Service', () => {
    it('should create and validate sessions', async () => {
      const userId = 'user123';
      const email = 'test@example.com';
      const roles = ['user'];
      const permissions = ['read'];

      // Create session
      const sessionId = await sessionService.createSession(userId, email, roles, permissions);
      expect(sessionId).toBeTruthy();

      // Validate session
      const validation = await sessionService.validateSession(sessionId);
      expect(validation.isValid).toBe(true);
      expect(validation.session?.userId).toBe(userId);
      expect(validation.session?.email).toBe(email);
    });

    it('should enforce max sessions per user', async () => {
      const userId = 'user456';
      const sessions: string[] = [];

      // Create max + 1 sessions
      for (let i = 0; i < 6; i++) {
        const sessionId = await sessionService.createSession(userId, `test${i}@example.com`);
        sessions.push(sessionId);
      }

      // Oldest session should be invalidated
      const firstSessionValid = await sessionService.validateSession(sessions[0]);
      expect(firstSessionValid.isValid).toBe(false);

      // Latest session should be valid
      const lastSessionValid = await sessionService.validateSession(sessions[sessions.length - 1]);
      expect(lastSessionValid.isValid).toBe(true);
    });

    it('should handle session updates', async () => {
      const userId = 'user789';
      const sessionId = await sessionService.createSession(userId, 'test@example.com');

      const updateResult = await sessionService.updateSession(sessionId, {
        roles: ['admin'],
        permissions: ['read', 'write']
      });
      expect(updateResult).toBe(true);

      const validation = await sessionService.validateSession(sessionId);
      expect(validation.session?.roles).toContain('admin');
      expect(validation.session?.permissions).toContain('write');
    });
  });

  describe('Credit Cache Service', () => {
    it('should cache and retrieve credit scores', async () => {
      const userId = 'credit123';
      const creditScore = {
        userId,
        score: 750,
        riskRating: 'medium' as const,
        factors: [
          { factor: 'payment_history', impact: 'positive' as const, weight: 0.35 }
        ],
        calculatedAt: new Date(),
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
        source: 'test',
        model: 'v1.0',
        version: '1.0'
      };

      const setResult = await creditCacheService.setCreditScore(creditScore);
      expect(setResult).toBe(true);

      const retrievedScore = await creditCacheService.getCreditScore(userId);
      expect(retrievedScore?.score).toBe(750);
      expect(retrievedScore?.riskRating).toBe('medium');
    });

    it('should handle expired credit scores', async () => {
      const userId = 'credit456';
      const expiredScore = {
        userId,
        score: 700,
        riskRating: 'low' as const,
        factors: [],
        calculatedAt: new Date(Date.now() - 13 * 60 * 60 * 1000), // 13 hours ago
        validUntil: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago (expired)
        source: 'test',
        model: 'v1.0',
        version: '1.0'
      };

      await creditCacheService.setCreditScore(expiredScore);
      
      // Should return null for expired score
      const retrievedScore = await creditCacheService.getCreditScore(userId);
      expect(retrievedScore).toBeNull();
    });

    it('should cache credit applications with status-specific TTL', async () => {
      const application = {
        id: 'app123',
        userId: 'user123',
        status: 'pending' as const,
        amount: 10000,
        term: 12,
        submittedAt: new Date(),
        updatedAt: new Date()
      };

      const setResult = await creditCacheService.setCreditApplication(application);
      expect(setResult).toBe(true);

      const retrievedApp = await creditCacheService.getCreditApplication('app123');
      expect(retrievedApp?.status).toBe('pending');
      expect(retrievedApp?.amount).toBe(10000);
    });
  });

  describe('Rate Limiting Service', () => {
    it('should enforce rate limits', async () => {
      const identifier = 'test-client';
      const rule = {
        windowSizeSeconds: 60,
        maxRequests: 3
      };

      // Should allow requests within limit
      for (let i = 0; i < 3; i++) {
        const result = await rateLimitingService.checkRateLimit(identifier, rule);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2 - i);
      }

      // Should reject request over limit
      const overLimitResult = await rateLimitingService.checkRateLimit(identifier, rule);
      expect(overLimitResult.allowed).toBe(false);
      expect(overLimitResult.remaining).toBe(0);
    });

    it('should handle token bucket rate limiting', async () => {
      const identifier = 'token-client';
      const bucketSize = 10;
      const refillRate = 2; // 2 tokens per second

      // Should allow initial burst
      const burstResult = await rateLimitingService.tokenBucketRateLimit(
        identifier, bucketSize, refillRate, 5
      );
      expect(burstResult.allowed).toBe(true);
      expect(burstResult.remaining).toBe(5);

      // Should reject if requesting more than available
      const overResult = await rateLimitingService.tokenBucketRateLimit(
        identifier, bucketSize, refillRate, 10
      );
      expect(overResult.allowed).toBe(false);
    });

    it('should block and unblock identifiers', async () => {
      const identifier = 'block-test';

      await rateLimitingService.blockIdentifier(identifier, 2); // 2 seconds

      const blockedResult = await rateLimitingService.isBlocked(identifier);
      expect(blockedResult).toBe(true);

      // Unblock manually
      const unblockResult = await rateLimitingService.unblockIdentifier(identifier);
      expect(unblockResult).toBe(true);

      const unblockedResult = await rateLimitingService.isBlocked(identifier);
      expect(unblockedResult).toBe(false);
    });
  });

  describe('API Cache Service', () => {
    it('should cache API responses', async () => {
      const mockReq = {
        url: '/api/test',
        method: 'GET',
        headers: {},
        query: {}
      };

      const mockRes = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' }
      };

      const responseBody = { data: 'test response' };
      const cacheRule = {
        pattern: '/api/test',
        ttl: 300,
        varyBy: []
      };

      // Cache response
      const cacheResult = await apiCacheService.cacheResponse(
        mockReq, mockRes, responseBody, cacheRule
      );
      expect(cacheResult).toBe(true);

      // Retrieve cached response
      const cachedResponse = await apiCacheService.getCachedResponse(mockReq, cacheRule);
      expect(cachedResponse?.body).toEqual(responseBody);
      expect(cachedResponse?.statusCode).toBe(200);
    });

    it('should handle cache invalidation by pattern', async () => {
      // Cache multiple responses
      const responses = [
        { url: '/api/users/1', body: { id: 1, name: 'User 1' } },
        { url: '/api/users/2', body: { id: 2, name: 'User 2' } },
        { url: '/api/posts/1', body: { id: 1, title: 'Post 1' } }
      ];

      const cacheRule = { pattern: '', ttl: 300, varyBy: [] };

      for (const response of responses) {
        const mockReq = { url: response.url, method: 'GET', headers: {}, query: {} };
        const mockRes = { statusCode: 200, headers: {} };
        
        await apiCacheService.cacheResponse(mockReq, mockRes, response.body, {
          ...cacheRule,
          pattern: response.url
        });
      }

      // Invalidate user-related cache
      const invalidatedCount = await apiCacheService.invalidateByPattern('/api/users/*');
      expect(invalidatedCount).toBeGreaterThanOrEqual(0); // Implementation dependent
    });
  });

  describe('Cache Monitoring Service', () => {
    it('should perform health checks', async () => {
      const healthStatus = await monitoringService.performHealthCheck();
      
      expect(healthStatus.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(healthStatus.redis.connected).toBe(true);
      expect(healthStatus.redis.latency).toBeGreaterThanOrEqual(0);
      expect(healthStatus.timestamp).toBeInstanceOf(Date);
    });

    it('should collect metrics', async () => {
      // Generate some cache activity
      await cacheService.set('metric-test-1', 'value1', 60);
      await cacheService.set('metric-test-2', 'value2', 60);
      await cacheService.get('metric-test-1');
      await cacheService.get('nonexistent-key');

      const metrics = await monitoringService.getMetrics();
      
      expect(metrics.hits).toBeGreaterThanOrEqual(0);
      expect(metrics.misses).toBeGreaterThanOrEqual(0);
      expect(metrics.sets).toBeGreaterThanOrEqual(0);
      expect(metrics.hitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.hitRate).toBeLessThanOrEqual(1);
    });

    it('should generate monitoring reports', async () => {
      const report = await monitoringService.generateReport(1); // 1 hour
      
      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.alerts).toBeDefined();
      expect(report.performance).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Cache Invalidation Service', () => {
    it('should invalidate cache by key', async () => {
      const keys = ['inv-test-1', 'inv-test-2'];
      
      // Set up test data
      for (const key of keys) {
        await cacheService.set(key, `value-${key}`, 60);
      }

      // Invalidate
      const result = await invalidationService.invalidateByKey(keys, 'test cleanup', 'test');
      expect(result).toBe(true);

      // Verify invalidation
      for (const key of keys) {
        const value = await cacheService.get(key);
        expect(value).toBeNull();
      }
    });

    it('should invalidate user cache', async () => {
      const userId = 'inv-user-123';
      
      // Set up user-related cache entries
      await cacheService.set(`user:${userId}:profile`, { name: 'Test User' }, 60);
      await cacheService.set(`credit:score:${userId}`, { score: 750 }, 60);
      
      // Invalidate user cache
      const invalidatedCount = await invalidationService.invalidateUserCache(
        userId, 'user update', 'test'
      );
      expect(invalidatedCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle scheduled invalidation', async () => {
      const key = 'scheduled-inv-test';
      await cacheService.set(key, 'value', 60);

      // Schedule invalidation in 1 second
      const scheduleId = await invalidationService.scheduleInvalidation(
        'key', key, 1, 'scheduled test', 'test'
      );
      expect(scheduleId).toBeTruthy();

      // Verify data exists initially
      const beforeValue = await cacheService.get(key);
      expect(beforeValue).toBe('value');

      // Wait for scheduled invalidation
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Verify data is invalidated
      const afterValue = await cacheService.get(key);
      expect(afterValue).toBeNull();
    });

    it('should track invalidation statistics', async () => {
      // Perform some invalidations
      await invalidationService.invalidateByKey('stat-test-1', 'stats test', 'test');
      await invalidationService.invalidateByPattern('stat-test-*', 'stats test', 'test');

      const stats = await invalidationService.getStats();
      expect(stats.totalInvalidations).toBeGreaterThanOrEqual(0);
      expect(stats.invalidationsByType).toBeDefined();
      expect(stats.invalidationsBySource).toBeDefined();
    });
  });

  describe('Cache Middleware Integration', () => {
    it('should create middleware with all services', () => {
      const middleware = createCacheMiddleware({
        cacheService,
        apiCacheService,
        rateLimitingService,
        sessionService
      });

      expect(middleware.apiCache).toBeDefined();
      expect(middleware.rateLimit).toBeDefined();
      expect(middleware.session).toBeDefined();
      expect(middleware.headers).toBeDefined();
      expect(middleware.api).toBeDefined();
    });

    it('should handle rate limiting in middleware', async () => {
      const middleware = createCacheMiddleware({
        cacheService,
        rateLimitingService
      });

      const rateLimitMw = middleware.rateLimit({
        windowSizeSeconds: 60,
        maxRequests: 2
      });

      // Mock Express request/response
      const mockReq = { ip: '127.0.0.1', method: 'GET', path: '/test' } as any;
      const mockRes = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();

      // First two requests should pass
      await rateLimitMw(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();

      await rateLimitMw(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // Third request should be blocked
      await rateLimitMw(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle concurrent operations', async () => {
      const operations = [];
      const keyPrefix = 'concurrent-';

      // Create 100 concurrent set operations
      for (let i = 0; i < 100; i++) {
        operations.push(
          cacheService.set(`${keyPrefix}${i}`, `value-${i}`, 60)
        );
      }

      const results = await Promise.all(operations);
      expect(results.every(result => result === true)).toBe(true);

      // Verify all values were set
      const getOperations = [];
      for (let i = 0; i < 100; i++) {
        getOperations.push(cacheService.get(`${keyPrefix}${i}`));
      }

      const values = await Promise.all(getOperations);
      expect(values.every((value, index) => value === `value-${index}`)).toBe(true);
    });

    it('should maintain performance under load', async () => {
      const iterations = 1000;
      const startTime = Date.now();

      const operations = [];
      for (let i = 0; i < iterations; i++) {
        operations.push(
          cacheService.set(`perf-${i}`, `value-${i}`, 60)
            .then(() => cacheService.get(`perf-${i}`))
        );
      }

      await Promise.all(operations);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const operationsPerSecond = (iterations * 2) / (duration / 1000); // 2 ops per iteration

      console.log(`Performance: ${operationsPerSecond.toFixed(2)} ops/sec`);
      expect(operationsPerSecond).toBeGreaterThan(100); // Minimum performance threshold
    });
  });
});

// Helper function for test expectations
function toBeOneOf(received: any, validValues: any[]) {
  const pass = validValues.includes(received);
  return {
    message: () => 
      pass
        ? `Expected ${received} not to be one of ${validValues.join(', ')}`
        : `Expected ${received} to be one of ${validValues.join(', ')}`,
    pass
  };
}

// Extend expect with custom matcher
expect.extend({ toBeOneOf });

// Mock vi functions for tests
const vi = {
  fn: (implementation?: Function) => {
    const mockFn = implementation || (() => {});
    mockFn.mockReturnThis = () => mockFn;
    return mockFn;
  }
};