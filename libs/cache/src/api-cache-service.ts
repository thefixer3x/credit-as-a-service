import pino from 'pino';
import crypto from 'crypto';
import { CacheService } from './cache-service.js';

const logger = pino({ name: 'api-cache-service' });

export interface ApiCacheConfig {
  keyPrefix: string;
  defaultTTL: number;
  maxCacheSize: number;
  enableCompression: boolean;
  varyHeaders: string[];
  skipCacheHeaders: string[];
}

export interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  contentType: string;
  etag?: string;
  lastModified?: Date;
  cacheControl?: string;
  cachedAt: Date;
  expiresAt: Date;
  requestHash: string;
  size: number;
}

export interface CacheRule {
  pattern: string | RegExp;
  ttl: number;
  varyBy?: string[];
  condition?: (req: any) => boolean;
  skipIf?: (req: any, res: any) => boolean;
}

export class ApiCacheService {
  private cache: CacheService;
  private config: ApiCacheConfig;
  private cacheRules: Map<string, CacheRule> = new Map();

  constructor(cache: CacheService, config?: Partial<ApiCacheConfig>) {
    this.cache = cache;
    this.config = {
      keyPrefix: 'api_cache:',
      defaultTTL: 300, // 5 minutes
      maxCacheSize: 1024 * 1024, // 1MB max per cached response
      enableCompression: true,
      varyHeaders: ['accept', 'accept-encoding', 'authorization'],
      skipCacheHeaders: ['cache-control', 'pragma', 'expires'],
      ...config
    };

    this.setupDefaultCacheRules();
  }

  /**
   * Setup default cache rules for common endpoints
   */
  private setupDefaultCacheRules(): void {
    // Credit scores - cache for 30 minutes
    this.addCacheRule('credit-scores', {
      pattern: /^\/api\/credit\/scores\/.+$/,
      ttl: 30 * 60,
      varyBy: ['userId'],
      condition: (req) => req.method === 'GET'
    });

    // User profiles - cache for 15 minutes
    this.addCacheRule('user-profiles', {
      pattern: /^\/api\/users\/.+\/profile$/,
      ttl: 15 * 60,
      varyBy: ['userId'],
      condition: (req) => req.method === 'GET'
    });

    // Application status - cache for 5 minutes
    this.addCacheRule('application-status', {
      pattern: /^\/api\/applications\/.+\/status$/,
      ttl: 5 * 60,
      varyBy: ['applicationId'],
      condition: (req) => req.method === 'GET'
    });

    // Static data - cache for 1 hour
    this.addCacheRule('static-data', {
      pattern: /^\/api\/(terms|rates|fees)$/,
      ttl: 60 * 60,
      condition: (req) => req.method === 'GET'
    });

    // Analytics data - cache for 10 minutes
    this.addCacheRule('analytics', {
      pattern: /^\/api\/analytics\/.+$/,
      ttl: 10 * 60,
      varyBy: ['userId', 'dateRange'],
      condition: (req) => req.method === 'GET'
    });
  }

  /**
   * Add custom cache rule
   */
  addCacheRule(name: string, rule: CacheRule): void {
    this.cacheRules.set(name, rule);
    logger.debug({ name, rule }, 'Cache rule added');
  }

  /**
   * Remove cache rule
   */
  removeCacheRule(name: string): boolean {
    const removed = this.cacheRules.delete(name);
    if (removed) {
      logger.debug({ name }, 'Cache rule removed');
    }
    return removed;
  }

  /**
   * Check if request should be cached
   */
  shouldCache(req: any, res?: any): CacheRule | null {
    try {
      const url = req.url || req.path;
      const method = req.method?.toUpperCase();

      // Skip non-GET requests by default
      if (method !== 'GET') {
        return null;
      }

      // Check cache-control headers
      const cacheControl = req.headers?.['cache-control'];
      if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
        return null;
      }

      // Find matching cache rule
      for (const [name, rule] of this.cacheRules) {
        let matches = false;

        if (typeof rule.pattern === 'string') {
          matches = url.includes(rule.pattern);
        } else if (rule.pattern instanceof RegExp) {
          matches = rule.pattern.test(url);
        }

        if (matches) {
          // Check additional conditions
          if (rule.condition && !rule.condition(req)) {
            continue;
          }

          if (rule.skipIf && res && rule.skipIf(req, res)) {
            continue;
          }

          return rule;
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Error checking if request should be cached');
      return null;
    }
  }

  /**
   * Generate cache key for request
   */
  generateCacheKey(req: any, rule?: CacheRule): string {
    try {
      const url = req.url || req.path;
      const method = req.method || 'GET';
      const queryString = req.query ? JSON.stringify(req.query) : '';

      let keyComponents = [method, url, queryString];

      // Add vary headers
      const varyHeaders = rule?.varyBy || this.config.varyHeaders;
      for (const header of varyHeaders) {
        const headerValue = req.headers?.[header.toLowerCase()];
        if (headerValue) {
          keyComponents.push(`${header}:${headerValue}`);
        }
      }

      // Add user context if available
      if (req.user?.id) {
        keyComponents.push(`user:${req.user.id}`);
      }

      // Add tenant context if available
      if (req.tenant?.id) {
        keyComponents.push(`tenant:${req.tenant.id}`);
      }

      const keyString = keyComponents.join('|');
      const hash = crypto.createHash('sha256').update(keyString).digest('hex');

      return `${this.config.keyPrefix}${hash}`;
    } catch (error) {
      logger.error({ error }, 'Error generating cache key');
      // Fallback to simple key
      const fallbackKey = crypto.createHash('sha256')
        .update(`${req.method || 'GET'}:${req.url || req.path}`)
        .digest('hex');
      return `${this.config.keyPrefix}${fallbackKey}`;
    }
  }

  /**
   * Cache API response
   */
  async cacheResponse(
    req: any,
    res: any,
    body: any,
    rule: CacheRule
  ): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(req, rule);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + rule.ttl * 1000);

      // Calculate response size
      const bodySize = Buffer.byteLength(JSON.stringify(body), 'utf8');
      
      // Skip caching if response is too large
      if (bodySize > this.config.maxCacheSize) {
        logger.warn({ 
          cacheKey, 
          size: bodySize, 
          maxSize: this.config.maxCacheSize 
        }, 'Response too large to cache');
        return false;
      }

      const cachedResponse: CachedResponse = {
        statusCode: res.statusCode || 200,
        headers: this.sanitizeHeaders(res.headers || {}),
        body,
        contentType: res.headers?.['content-type'] || 'application/json',
        etag: res.headers?.etag,
        lastModified: res.headers?.['last-modified'] ? 
          new Date(res.headers['last-modified']) : undefined,
        cacheControl: res.headers?.['cache-control'],
        cachedAt: now,
        expiresAt,
        requestHash: crypto.createHash('md5').update(cacheKey).digest('hex'),
        size: bodySize
      };

      const success = await this.cache.set(cacheKey, cachedResponse, rule.ttl);

      if (success) {
        logger.debug({
          cacheKey,
          size: bodySize,
          ttl: rule.ttl,
          expiresAt: expiresAt.toISOString()
        }, 'API response cached');

        // Update cache metrics
        await this.updateCacheMetrics('set', bodySize);
      }

      return success;
    } catch (error) {
      logger.error({ error }, 'Failed to cache API response');
      return false;
    }
  }

  /**
   * Get cached response
   */
  async getCachedResponse(req: any, rule?: CacheRule): Promise<CachedResponse | null> {
    try {
      const cacheKey = this.generateCacheKey(req, rule);
      const cachedResponse = await this.cache.get<CachedResponse>(cacheKey);

      if (!cachedResponse) {
        await this.updateCacheMetrics('miss');
        return null;
      }

      // Check if cached response is still valid
      if (new Date(cachedResponse.expiresAt) < new Date()) {
        await this.cache.del(cacheKey);
        await this.updateCacheMetrics('expired');
        return null;
      }

      // Check ETags for conditional requests
      const ifNoneMatch = req.headers?.['if-none-match'];
      if (ifNoneMatch && cachedResponse.etag && ifNoneMatch === cachedResponse.etag) {
        await this.updateCacheMetrics('hit_304');
        return { ...cachedResponse, statusCode: 304 };
      }

      // Check last modified for conditional requests
      const ifModifiedSince = req.headers?.['if-modified-since'];
      if (ifModifiedSince && cachedResponse.lastModified) {
        const ifModifiedSinceDate = new Date(ifModifiedSince);
        if (cachedResponse.lastModified <= ifModifiedSinceDate) {
          await this.updateCacheMetrics('hit_304');
          return { ...cachedResponse, statusCode: 304 };
        }
      }

      await this.updateCacheMetrics('hit', cachedResponse.size);
      return cachedResponse;
    } catch (error) {
      logger.error({ error }, 'Failed to get cached response');
      await this.updateCacheMetrics('error');
      return null;
    }
  }

  /**
   * Invalidate cached responses by pattern
   */
  async invalidateByPattern(pattern: string | RegExp): Promise<number> {
    try {
      // This would require Redis SCAN with pattern matching in production
      // For now, we'll track invalidation requests
      logger.info({ pattern }, 'Cache invalidation requested by pattern');
      
      await this.updateCacheMetrics('invalidation');
      return 0; // Would return actual count in production
    } catch (error) {
      logger.error({ error, pattern }, 'Failed to invalidate cache by pattern');
      return 0;
    }
  }

  /**
   * Invalidate cached responses by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      // This would be implemented with cache tagging in production
      logger.info({ tags }, 'Cache invalidation requested by tags');
      
      await this.updateCacheMetrics('invalidation');
      return 0; // Would return actual count in production
    } catch (error) {
      logger.error({ error, tags }, 'Failed to invalidate cache by tags');
      return 0;
    }
  }

  /**
   * Invalidate specific cached response
   */
  async invalidateResponse(req: any, rule?: CacheRule): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(req, rule);
      const result = await this.cache.del(cacheKey);
      
      if (result) {
        await this.updateCacheMetrics('invalidation');
        logger.debug({ cacheKey }, 'Cached response invalidated');
      }
      
      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to invalidate cached response');
      return false;
    }
  }

  /**
   * Warm cache with pre-computed responses
   */
  async warmCache(entries: Array<{
    req: any;
    response: any;
    rule: CacheRule;
  }>): Promise<number> {
    try {
      let warmedCount = 0;

      for (const entry of entries) {
        const success = await this.cacheResponse(
          entry.req,
          { statusCode: 200, headers: {} },
          entry.response,
          entry.rule
        );
        if (success) warmedCount++;
      }

      logger.info({ 
        total: entries.length, 
        warmed: warmedCount 
      }, 'Cache warming completed');

      return warmedCount;
    } catch (error) {
      logger.error({ error }, 'Cache warming failed');
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    entries: number;
    errors: number;
  }> {
    try {
      const metricsKey = `${this.config.keyPrefix}metrics`;
      const metrics = await this.cache.hgetall<number>(metricsKey);

      if (!metrics) {
        return {
          hits: 0,
          misses: 0,
          hitRate: 0,
          size: 0,
          entries: 0,
          errors: 0
        };
      }

      const hits = metrics.hits || 0;
      const misses = metrics.misses || 0;
      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      return {
        hits,
        misses,
        hitRate,
        size: metrics.size || 0,
        entries: metrics.entries || 0,
        errors: metrics.errors || 0
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cache stats');
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        entries: 0,
        errors: 0
      };
    }
  }

  /**
   * Clear all cached responses
   */
  async clearCache(): Promise<boolean> {
    try {
      // This would require Redis SCAN with pattern deletion in production
      logger.info('API cache clear requested');
      
      // Reset metrics
      const metricsKey = `${this.config.keyPrefix}metrics`;
      await this.cache.del(metricsKey);
      
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to clear API cache');
      return false;
    }
  }

  /**
   * Sanitize response headers for caching
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      // Skip headers that shouldn't be cached
      if (this.config.skipCacheHeaders.includes(lowerKey)) {
        continue;
      }

      // Skip security headers that are request-specific
      if (lowerKey.startsWith('x-') && 
          ['x-request-id', 'x-correlation-id', 'x-trace-id'].includes(lowerKey)) {
        continue;
      }

      sanitized[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }

    return sanitized;
  }

  /**
   * Update cache metrics
   */
  private async updateCacheMetrics(
    operation: 'hit' | 'miss' | 'set' | 'error' | 'expired' | 'hit_304' | 'invalidation',
    size?: number
  ): Promise<void> {
    try {
      const metricsKey = `${this.config.keyPrefix}metrics`;
      const client = this.cache.getClient();

      const pipeline = client.pipeline();
      
      switch (operation) {
        case 'hit':
        case 'hit_304':
          pipeline.hincrby(metricsKey, 'hits', 1);
          break;
        case 'miss':
        case 'expired':
          pipeline.hincrby(metricsKey, 'misses', 1);
          break;
        case 'set':
          pipeline.hincrby(metricsKey, 'entries', 1);
          if (size) {
            pipeline.hincrby(metricsKey, 'size', size);
          }
          break;
        case 'error':
          pipeline.hincrby(metricsKey, 'errors', 1);
          break;
        case 'invalidation':
          pipeline.hincrby(metricsKey, 'invalidations', 1);
          break;
      }

      pipeline.expire(metricsKey, 24 * 60 * 60); // 24 hours
      await pipeline.exec();
    } catch (error) {
      logger.error({ error, operation }, 'Failed to update cache metrics');
    }
  }
}