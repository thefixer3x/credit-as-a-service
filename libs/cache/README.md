# Credit-as-a-Service Cache Layer

A comprehensive Redis-based caching solution designed specifically for financial services and credit platforms. This library provides enterprise-grade caching with specialized features for credit scoring, session management, rate limiting, and API response caching.

## Features

### 🚀 Core Caching
- **Redis Client Management**: Advanced Redis connection handling with cluster support, TLS, and connection pooling
- **Cache Service**: High-performance caching with TTL, batch operations, and cache-aside patterns
- **Session Management**: Secure session handling with automatic expiration and multi-device support
- **Cache Warming**: Preload frequently accessed data for optimal performance

### 💳 Credit-Specific Caching
- **Credit Score Caching**: Intelligent caching with freshness-based TTL and risk rating indexing
- **Application Caching**: Status-aware caching for loan applications with appropriate TTL strategies
- **Credit Limit Caching**: Real-time credit limit tracking with quick invalidation
- **Risk Assessment Caching**: Cached risk calculations with configurable refresh intervals

### 🛡️ Security & Rate Limiting
- **Advanced Rate Limiting**: Sliding window and token bucket algorithms
- **IP & User-based Limiting**: Flexible identifier-based rate limiting
- **Automatic Blocking**: Configurable blocking for repeat violators
- **Rate Limit Analytics**: Comprehensive statistics and monitoring

### 🌐 API Response Caching
- **Smart Caching Rules**: Pattern-based caching with conditional logic
- **HTTP Cache Headers**: Proper ETag, Last-Modified, and Cache-Control handling
- **Vary Header Support**: Cache variations based on request headers
- **Compression Support**: Optional response compression for bandwidth optimization

### 📊 Monitoring & Analytics
- **Health Monitoring**: Real-time health checks and performance metrics
- **Cache Analytics**: Hit/miss ratios, memory usage, and performance tracking
- **Alert System**: Configurable alerts for cache issues and performance degradation
- **Comprehensive Reporting**: Detailed reports with recommendations

### 🔄 Cache Invalidation
- **Distributed Invalidation**: Cluster-wide cache invalidation with pub/sub
- **Pattern-based Invalidation**: Invalidate by key patterns, tags, or user context
- **Event-driven Invalidation**: Automatic invalidation based on business events
- **Scheduled Invalidation**: Time-based invalidation for eventual consistency

### 🔧 Express.js Integration
- **Middleware Suite**: Ready-to-use Express middleware for all caching features
- **Route-level Caching**: Fine-grained control over caching behavior
- **Session Middleware**: Seamless session management integration
- **Error Handling**: Graceful fallbacks and error recovery

## Installation

```bash
npm install @caas/cache
```

## Quick Start

### Basic Setup

```typescript
import { initializeProdCache, createCacheMiddleware } from '@caas/cache';

// Initialize cache infrastructure
const cache = await initializeProdCache({
  redis: {
    host: 'localhost',
    port: '6379',
    password: process.env.REDIS_PASSWORD
  }
});

// Create middleware
const middleware = createCacheMiddleware({
  cacheService: cache.cacheService,
  apiCacheService: cache.apiCacheService,
  rateLimitingService: cache.rateLimitingService,
  sessionService: cache.sessionService
});
```

### Express.js Integration

```typescript
import express from 'express';

const app = express();

// Global rate limiting
app.use(middleware.rateLimit({
  windowSizeSeconds: 60,
  maxRequests: 1000
}));

// Credit scores with specialized caching
app.get('/api/credit/scores/:userId', 
  middleware.session(true),
  middleware.rateLimit({ maxRequests: 10 }),
  middleware.apiCache(),
  async (req, res) => {
    const { userId } = req.params;
    
    // Check cache first
    let creditScore = await cache.creditCacheService.getCreditScore(userId);
    
    if (!creditScore) {
      // Fetch from external service
      creditScore = await fetchCreditScore(userId);
      
      // Cache with intelligent TTL
      await cache.creditCacheService.setCreditScore(creditScore);
    }
    
    res.json(creditScore);
  }
);
```

## Configuration

### Environment Variables

```bash
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
REDIS_KEY_PREFIX=caas:

# Redis Cluster (optional)
REDIS_CLUSTER_ENABLED=false
REDIS_CLUSTER_NODES='[{"host":"node1","port":7000},{"host":"node2","port":7001}]'

# Security
REDIS_TLS_ENABLED=true
REDIS_TLS_CERT=/path/to/cert.pem
REDIS_TLS_KEY=/path/to/key.pem
REDIS_TLS_CA=/path/to/ca.pem

# Performance
REDIS_POOL_SIZE=20
REDIS_MAX_MEMORY_POLICY=allkeys-lru

# Cache Policies
CACHE_DEFAULT_TTL=300
CREDIT_SCORE_TTL=43200
CREDIT_APPLICATION_TTL=86400
CREDIT_LIMIT_TTL=1800

# Rate Limiting
RATE_LIMIT_DEFAULT_WINDOW=60
RATE_LIMIT_DEFAULT_MAX=1000
RATE_LIMIT_BLOCK_DURATION=300

# Session Management
SESSION_TTL_SECONDS=86400
SESSION_MAX_PER_USER=5
SESSION_EXTEND_ON_ACCESS=true

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL=30000
MONITORING_RETENTION_HOURS=24
```

### Programmatic Configuration

```typescript
import { initializeCache } from '@caas/cache';

const cache = await initializeCache({
  redis: {
    host: 'redis.example.com',
    port: '6379',
    enableCluster: true,
    enableTLS: true,
    connectionPoolSize: 20
  },
  session: {
    ttlSeconds: 24 * 60 * 60, // 24 hours
    maxSessions: 5,
    extendOnAccess: true
  },
  rateLimit: {
    defaultWindowSize: 60,
    defaultMaxRequests: 1000,
    enableBlocking: true
  },
  apiCache: {
    defaultTTL: 300,
    enableCompression: true,
    maxCacheSize: 1024 * 1024 // 1MB
  }
});
```

## Advanced Usage

### Credit-Specific Caching

```typescript
// Cache credit score with automatic TTL calculation
const creditScore = {
  userId: 'user123',
  score: 750,
  riskRating: 'medium',
  calculatedAt: new Date(),
  validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
  factors: [
    { factor: 'payment_history', impact: 'positive', weight: 0.35 }
  ]
};

await cache.creditCacheService.setCreditScore(creditScore);

// Retrieve with freshness validation
const cachedScore = await cache.creditCacheService.getCreditScore('user123');
```

### Custom Rate Limiting

```typescript
// User-specific rate limiting
app.post('/api/credit/applications',
  middleware.rateLimit({
    windowSizeSeconds: 300, // 5 minutes
    maxRequests: 3, // Only 3 applications per 5 minutes
    identifier: (req) => `user:${req.user.id}`
  }),
  async (req, res) => {
    // Handle application creation
  }
);

// Token bucket for API calls
const apiResult = await cache.rateLimitingService.tokenBucketRateLimit(
  'api_client_123',
  100, // bucket size
  10,  // refill rate (tokens per second)
  5    // tokens requested
);
```

### Cache Invalidation Strategies

```typescript
// Event-driven invalidation
await cache.invalidationService.triggerInvalidation('user.updated', {
  userId: 'user123'
});

// Pattern-based invalidation
await cache.invalidationService.invalidateByPattern('credit:*:user123');

// Tag-based invalidation
await cache.invalidationService.invalidateByTags(['user-123', 'credit-data']);

// Scheduled invalidation
const scheduleId = await cache.invalidationService.scheduleInvalidation(
  'pattern',
  'api_cache:*stale*',
  300, // 5 minutes delay
  'scheduled cleanup'
);
```

### Monitoring and Alerts

```typescript
// Get health status
const health = await cache.monitoringService.performHealthCheck();
console.log('Cache Health:', health.status);

// Get performance metrics
const metrics = await cache.monitoringService.getMetrics();
console.log('Hit Rate:', metrics.hitRate);
console.log('Memory Usage:', metrics.memoryUsage);

// Generate comprehensive report
const report = await cache.monitoringService.generateReport(24); // 24 hours
console.log('Recommendations:', report.recommendations);

// Custom alert rules
cache.monitoringService.addAlertRule({
  name: 'High Memory Usage',
  metric: 'memoryUsage',
  operator: 'gt',
  threshold: 0.85,
  duration: 300,
  severity: 'high',
  enabled: true
});
```

### Cache-Aware Service Pattern

```typescript
import { CacheAwareRequest } from '@caas/cache';

class CreditService {
  private cacheRequest: CacheAwareRequest;

  constructor(cacheService) {
    this.cacheRequest = new CacheAwareRequest(cacheService);
  }

  async getCreditScore(userId: string) {
    return this.cacheRequest.getOrFetch(
      `credit:score:${userId}`,
      () => this.fetchFromExternalAPI(userId),
      30 * 60 // 30 minutes TTL
    );
  }

  async updateCreditScore(userId: string, newScore: any) {
    return this.cacheRequest.invalidateAfter(
      () => this.updateInDatabase(userId, newScore),
      [`credit:score:${userId}`, `api_cache:*${userId}*`]
    );
  }
}
```

## Performance Optimization

### Cache Warming

```typescript
// Warm frequently accessed data
await cache.cacheService.warm([
  {
    key: 'popular:rates',
    fetcher: () => fetchCurrentRates(),
    ttl: 3600 // 1 hour
  },
  {
    key: 'terms:standard',
    fetcher: () => fetchTermsAndConditions(),
    ttl: 86400 // 24 hours
  }
]);
```

### Batch Operations

```typescript
// Batch set operations
await cache.cacheService.mset({
  'user:123:profile': userProfile,
  'user:123:preferences': userPrefs,
  'user:123:settings': userSettings
}, 3600);

// Batch get operations
const [profile, prefs, settings] = await cache.cacheService.mget([
  'user:123:profile',
  'user:123:preferences',
  'user:123:settings'
]);
```

### Connection Optimization

```typescript
// Cluster configuration for high availability
const cache = await initializeCache({
  redis: {
    enableCluster: true,
    clusterNodes: [
      { host: 'redis-1.example.com', port: 7000 },
      { host: 'redis-2.example.com', port: 7001 },
      { host: 'redis-3.example.com', port: 7002 }
    ],
    connectionPoolSize: 50,
    enableAutoPipelining: true
  }
});
```

## Security Considerations

### TLS Configuration

```typescript
const cache = await initializeCache({
  redis: {
    enableTLS: true,
    tlsCert: fs.readFileSync('/path/to/client-cert.pem'),
    tlsKey: fs.readFileSync('/path/to/client-key.pem'),
    tlsCa: fs.readFileSync('/path/to/ca-cert.pem')
  }
});
```

### Session Security

```typescript
// Configure secure sessions
app.use(middleware.session({
  cookieName: 'secure_session',
  secure: true, // HTTPS only
  httpOnly: true,
  sameSite: 'strict',
  required: true // Reject requests without valid sessions
}));
```

## Testing

```typescript
import { initializeCache } from '@caas/cache';

describe('Cache Integration', () => {
  let cache;

  beforeAll(async () => {
    cache = await initializeCache({
      redis: { db: '15' } // Use test database
    });
  });

  afterAll(async () => {
    await cache.redisClient.disconnect();
  });

  beforeEach(async () => {
    await cache.cacheService.flushall(); // Clean test data
  });

  it('should cache and retrieve values', async () => {
    await cache.cacheService.set('test:key', 'test value', 60);
    const value = await cache.cacheService.get('test:key');
    expect(value).toBe('test value');
  });
});
```

## Production Deployment

### Docker Configuration

```dockerfile
# Redis with persistence
FROM redis:7-alpine
COPY redis.conf /usr/local/etc/redis/redis.conf
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-cluster
spec:
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
```

### Health Checks

```typescript
// Health check endpoint
app.get('/health/cache', async (req, res) => {
  try {
    const health = await cache.monitoringService.performHealthCheck();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});
```

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   ```typescript
   // Increase timeouts for slow networks
   const cache = await initializeCache({
     redis: {
       connectTimeout: 30000,
       commandTimeout: 10000
     }
   });
   ```

2. **Memory Issues**
   ```bash
   # Check Redis memory usage
   redis-cli info memory
   
   # Set memory policy
   redis-cli config set maxmemory-policy allkeys-lru
   ```

3. **High Latency**
   ```typescript
   // Enable connection pooling
   const cache = await initializeCache({
     redis: {
       connectionPoolSize: 20,
       enableAutoPipelining: true
     }
   });
   ```

### Debugging

```typescript
import pino from 'pino';

// Enable debug logging
const logger = pino({ level: 'debug' });

// Monitor cache operations
cache.cacheService.on('operation', (event) => {
  logger.debug(event, 'Cache operation');
});
```

## API Reference

### Core Services

- **CacheService**: Basic caching operations with TTL and batch support
- **SessionService**: Session management with multi-device support
- **CreditCacheService**: Credit-specific caching with intelligent TTL
- **RateLimitingService**: Advanced rate limiting with multiple algorithms
- **ApiCacheService**: HTTP response caching with smart invalidation
- **CacheMonitoringService**: Health monitoring and performance analytics
- **CacheInvalidationService**: Distributed cache invalidation

### Middleware

- **apiCacheMiddleware**: Cache API responses automatically
- **rateLimitMiddleware**: Apply rate limits to routes
- **sessionMiddleware**: Handle session management
- **cacheHeadersMiddleware**: Set appropriate cache headers
- **cacheInvalidationMiddleware**: Trigger invalidation on data changes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [link-to-issues]
- Documentation: [link-to-docs]
- Support Email: cache-support@caas-platform.com