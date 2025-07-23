import express from 'express';
import { 
  initializeProdCache,
  createCacheMiddleware,
  CacheAwareRequest,
  CreditCacheService,
  RateLimitingService,
  ApiCacheService,
  CacheMonitoringService,
  CacheInvalidationService
} from '../index.js';

/**
 * Example: Complete cache setup for Credit-as-a-Service platform
 */
export async function setupCreditPlatformCache() {
  // Initialize comprehensive cache infrastructure
  const cache = await initializeProdCache({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || '6379',
      password: process.env.REDIS_PASSWORD,
      enableCluster: process.env.REDIS_CLUSTER_ENABLED === 'true',
      enableTLS: process.env.REDIS_TLS_ENABLED === 'true'
    },
    session: {
      ttlSeconds: 24 * 60 * 60, // 24 hours
      maxSessions: 5,
      extendOnAccess: true
    }
  });

  // Setup cache middleware
  const middleware = createCacheMiddleware({
    cacheService: cache.cacheService,
    apiCacheService: cache.apiCacheService,
    rateLimitingService: cache.rateLimitingService,
    sessionService: cache.sessionService
  });

  return { cache, middleware };
}

/**
 * Example: Express.js application with comprehensive caching
 */
export async function createCachedExpressApp() {
  const app = express();
  const { cache, middleware } = await setupCreditPlatformCache();

  // Global rate limiting
  app.use(middleware.rateLimit({
    windowSizeSeconds: 60,
    maxRequests: 1000
  }));

  // Session management for authenticated routes
  app.use('/api/protected', middleware.session(true));

  // Credit scores endpoint with specialized caching
  app.get('/api/credit/scores/:userId', 
    middleware.rateLimit({
      windowSizeSeconds: 60,
      maxRequests: 10 // More restrictive for sensitive data
    }),
    middleware.apiCache(),
    async (req, res) => {
      const { userId } = req.params;
      
      // Use credit cache service for optimized credit score caching
      let creditScore = await cache.creditCacheService.getCreditScore(userId);
      
      if (!creditScore) {
        // Fetch from external service (simulated)
        creditScore = await fetchCreditScoreFromProvider(userId);
        
        if (creditScore) {
          // Cache with appropriate TTL based on score freshness
          await cache.creditCacheService.setCreditScore(creditScore);
        }
      }

      if (!creditScore) {
        return res.status(404).json({ error: 'Credit score not found' });
      }

      res.json(creditScore);
    }
  );

  // Credit applications with cache invalidation
  app.post('/api/credit/applications',
    middleware.session(true),
    middleware.rateLimit({
      windowSizeSeconds: 300, // 5 minutes
      maxRequests: 3 // Very restrictive for applications
    }),
    async (req, res) => {
      const application = req.body;
      const userId = (req as any).user.id;

      // Create application (simulated)
      const newApplication = await createCreditApplication({ ...application, userId });

      // Cache the new application
      await cache.creditCacheService.setCreditApplication(newApplication);

      // Trigger cache invalidation for related data
      await cache.invalidationService?.triggerInvalidation('application.created', {
        applicationId: newApplication.id,
        userId
      });

      res.status(201).json(newApplication);
    }
  );

  // Health check endpoint with monitoring integration
  app.get('/api/health/cache', async (req, res) => {
    try {
      const health = await cache.monitoringService?.performHealthCheck();
      const stats = await cache.monitoringService?.getMetrics();

      res.json({
        status: health?.status || 'unknown',
        redis: health?.redis,
        cache: health?.cache,
        metrics: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Cache management endpoints for admin
  app.post('/api/admin/cache/invalidate',
    middleware.session(true),
    async (req, res) => {
      const { type, target, reason } = req.body;
      const userId = (req as any).user.id;

      // Check admin permissions (simplified)
      if (!(req as any).user.roles.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      let invalidatedCount = 0;

      switch (type) {
        case 'user':
          invalidatedCount = await cache.invalidationService?.invalidateUserCache(target, reason, userId) || 0;
          break;
        case 'pattern':
          invalidatedCount = await cache.invalidationService?.invalidateByPattern(target, reason, userId) || 0;
          break;
        case 'key':
          const success = await cache.invalidationService?.invalidateByKey(target, reason, userId) || false;
          invalidatedCount = success ? 1 : 0;
          break;
      }

      res.json({
        success: true,
        invalidatedCount,
        type,
        target,
        reason
      });
    }
  );

  return app;
}

/**
 * Example: Service class with integrated caching
 */
export class CachedCreditService {
  private cacheRequest: CacheAwareRequest;
  private creditCache: CreditCacheService;
  private rateLimiter: RateLimitingService;

  constructor(
    private creditCacheService: CreditCacheService,
    private rateLimitingService: RateLimitingService,
    private cacheService: any
  ) {
    this.cacheRequest = new CacheAwareRequest(cacheService);
    this.creditCache = creditCacheService;
    this.rateLimiter = rateLimitingService;
  }

  /**
   * Get user's credit score with caching
   */
  async getCreditScore(userId: string): Promise<any> {
    // Check rate limit for this user
    const rateLimitResult = await this.rateLimiter.checkRateLimit(
      `credit_score:${userId}`,
      { windowSizeSeconds: 300, maxRequests: 5 }
    );

    if (!rateLimitResult.allowed) {
      throw new Error('Rate limit exceeded for credit score requests');
    }

    // Try cache first
    let creditScore = await this.creditCache.getCreditScore(userId);
    
    if (!creditScore) {
      // Use cache-aware request with fallback
      creditScore = await this.cacheRequest.getOrFetch(
        `credit:score:${userId}`,
        () => this.fetchCreditScoreFromProvider(userId),
        30 * 60 // 30 minutes
      );
    }

    return creditScore;
  }

  /**
   * Update credit score with cache invalidation
   */
  async updateCreditScore(userId: string, newScore: any): Promise<void> {
    // Update in external system
    await this.updateCreditScoreInProvider(userId, newScore);

    // Use cache invalidation after successful update
    await this.cacheRequest.invalidateAfter(
      async () => {
        // Cache the new score
        await this.creditCache.setCreditScore(newScore);
        return newScore;
      },
      [
        `credit:score:${userId}`,
        `credit:risk:${userId}`,
        `api_cache:*credit*${userId}*`
      ]
    );
  }

  /**
   * Get credit applications with pagination caching
   */
  async getCreditApplications(
    userId: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<any> {
    const cacheKey = `credit:applications:${userId}:${page}:${limit}`;
    
    return this.cacheRequest.getOrFetch(
      cacheKey,
      async () => {
        // Fetch from database
        const applications = await this.fetchApplicationsFromDB(userId, page, limit);
        
        // Also cache individual applications
        for (const app of applications.data) {
          await this.creditCache.setCreditApplication(app);
        }
        
        return applications;
      },
      5 * 60 // 5 minutes for paginated data
    );
  }

  // Private helper methods (simulated)
  private async fetchCreditScoreFromProvider(userId: string): Promise<any> {
    // Simulate external API call
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      userId,
      score: 750,
      riskRating: 'medium' as const,
      factors: [],
      calculatedAt: new Date(),
      validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      source: 'provider',
      model: 'v2.1',
      version: '1.0'
    };
  }

  private async updateCreditScoreInProvider(userId: string, score: any): Promise<void> {
    // Simulate external API call
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  private async fetchApplicationsFromDB(userId: string, page: number, limit: number): Promise<any> {
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 80));
    return {
      data: [
        {
          id: '123',
          userId,
          status: 'pending' as const,
          amount: 10000,
          term: 12,
          submittedAt: new Date(),
          updatedAt: new Date()
        }
      ],
      pagination: {
        page,
        limit,
        total: 1,
        pages: 1
      }
    };
  }
}

/**
 * Example: Background tasks with cache warming
 */
export class CacheWarmingService {
  constructor(
    private creditCache: CreditCacheService,
    private apiCache: ApiCacheService,
    private monitoringService: CacheMonitoringService
  ) {}

  /**
   * Warm frequently accessed credit scores
   */
  async warmCreditScores(userIds: string[]): Promise<void> {
    const warmingEntries = userIds.map(userId => ({
      key: `credit:score:${userId}`,
      fetcher: () => this.fetchCreditScore(userId),
      ttl: 30 * 60 // 30 minutes
    }));

    // Use underlying cache to warm entries
    const cacheService = (this.creditCache as any).cache;
    await cacheService.warm(warmingEntries);
  }

  /**
   * Warm API responses
   */
  async warmApiResponses(): Promise<void> {
    const commonEndpoints = [
      { endpoint: '/api/rates', ttl: 60 * 60 }, // 1 hour
      { endpoint: '/api/terms', ttl: 60 * 60 }, // 1 hour
      { endpoint: '/api/fees', ttl: 60 * 60 }   // 1 hour
    ];

    const warmingEntries = commonEndpoints.map(({ endpoint, ttl }) => ({
      req: { url: endpoint, method: 'GET', headers: {} },
      response: this.fetchStaticData(endpoint),
      rule: { pattern: endpoint, ttl, varyBy: [] }
    }));

    await this.apiCache.warmCache(warmingEntries as any);
  }

  /**
   * Scheduled cache maintenance
   */
  async performMaintenance(): Promise<void> {
    // Record current metrics
    await this.monitoringService.recordMetrics();

    // Clean up expired entries (Redis handles this automatically, but we can log it)
    console.log('Cache maintenance completed at', new Date().toISOString());
  }

  private async fetchCreditScore(userId: string): Promise<any> {
    // Simulate fetching credit score
    return {
      userId,
      score: Math.floor(Math.random() * 200) + 600,
      calculatedAt: new Date(),
      validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000)
    };
  }

  private async fetchStaticData(endpoint: string): Promise<any> {
    // Simulate fetching static data
    switch (endpoint) {
      case '/api/rates':
        return { rates: [{ term: 12, rate: 0.05 }, { term: 24, rate: 0.06 }] };
      case '/api/terms':
        return { terms: ['Terms and conditions content...'] };
      case '/api/fees':
        return { fees: [{ type: 'processing', amount: 50 }] };
      default:
        return {};
    }
  }

  private getCache() {
    return (this.creditCache as any).cache; // Access underlying cache service
  }
}

// Simulated external functions
async function fetchCreditScoreFromProvider(userId: string): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    userId,
    score: 750,
    riskRating: 'medium' as const,
    factors: [],
    calculatedAt: new Date(),
    validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000),
    source: 'provider',
    model: 'v2.1',
    version: '1.0'
  };
}

async function createCreditApplication(data: any): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    id: Math.random().toString(36).substr(2, 9),
    ...data,
    status: 'pending' as const,
    submittedAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Example usage in main application
 */
export async function startCreditPlatform() {
  try {
    // Initialize cache infrastructure
    const { cache, middleware } = await setupCreditPlatformCache();
    
    // Create Express app with caching
    const app = await createCachedExpressApp();
    
    // Create cached service
    const creditService = new CachedCreditService(
      cache.creditCacheService!,
      cache.rateLimitingService!,
      cache.cacheService
    );
    
    // Setup cache warming service
    const warmingService = new CacheWarmingService(
      cache.creditCacheService!,
      cache.apiCacheService!,
      cache.monitoringService!
    );
    
    // Start cache warming (could be scheduled with cron)
    await warmingService.warmApiResponses();
    
    // Setup periodic maintenance
    setInterval(async () => {
      await warmingService.performMaintenance();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Start server
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Credit-as-a-Service platform started on port ${port}`);
      console.log('Cache infrastructure:', {
        redis: cache.redisClient.isReady(),
        monitoring: !!cache.monitoringService,
        invalidation: !!cache.invalidationService
      });
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Shutting down cache services...');
      await cache.monitoringService?.cleanup();
      await cache.invalidationService?.cleanup();
      await cache.redisClient.disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start Credit-as-a-Service platform:', error);
    process.exit(1);
  }
}