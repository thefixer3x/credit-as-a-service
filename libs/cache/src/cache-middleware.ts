import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { CacheService } from './cache-service.js';
import { ApiCacheService, CacheRule } from './api-cache-service.js';
import { RateLimitingService, RateLimitRule } from './rate-limiting-service.js';
import { SessionService } from './session-service.js';

const logger = pino({ name: 'cache-middleware' });

export interface CacheMiddlewareConfig {
  cacheService: CacheService;
  apiCacheService?: ApiCacheService;
  rateLimitingService?: RateLimitingService;
  sessionService?: SessionService;
}

/**
 * API Response Caching Middleware
 */
export function apiCacheMiddleware(
  apiCacheService: ApiCacheService,
  options?: {
    skipIf?: (req: Request, res: Response) => boolean;
    keyGenerator?: (req: Request) => string;
    ttlGenerator?: (req: Request, res: Response) => number;
  }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip caching if conditions are met
      if (options?.skipIf && options.skipIf(req, res)) {
        return next();
      }

      // Check if request should be cached
      const cacheRule = apiCacheService.shouldCache(req, res);
      if (!cacheRule) {
        return next();
      }

      // Try to get cached response
      const cachedResponse = await apiCacheService.getCachedResponse(req, cacheRule);
      if (cachedResponse && cachedResponse.statusCode !== 304) {
        // Set cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', apiCacheService.generateCacheKey(req, cacheRule));
        res.set('Cache-Control', cachedResponse.cacheControl || 'public, max-age=300');
        
        if (cachedResponse.etag) {
          res.set('ETag', cachedResponse.etag);
        }

        if (cachedResponse.lastModified) {
          res.set('Last-Modified', cachedResponse.lastModified.toUTCString());
        }

        // Set additional headers
        Object.entries(cachedResponse.headers).forEach(([key, value]) => {
          res.set(key, value);
        });

        return res.status(cachedResponse.statusCode)
          .type(cachedResponse.contentType)
          .json(cachedResponse.body);
      }

      // Handle conditional requests (304 Not Modified)
      if (cachedResponse && cachedResponse.statusCode === 304) {
        res.set('X-Cache', 'HIT');
        return res.status(304).end();
      }

      // Store original res.json to intercept response
      const originalJson = res.json;
      res.json = function(body: any) {
        // Cache the response
        apiCacheService.cacheResponse(req, res, body, cacheRule)
          .catch(error => {
            logger.error({ error }, 'Failed to cache response');
          });

        // Set cache headers
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-Key', apiCacheService.generateCacheKey(req, cacheRule));

        // Call original json method
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      logger.error({ error }, 'API cache middleware error');
      next();
    }
  };
}

/**
 * Rate Limiting Middleware
 */
export function rateLimitMiddleware(
  rateLimitingService: RateLimitingService,
  options?: {
    keyGenerator?: (req: Request) => string;
    skipIf?: (req: Request) => boolean;
    onLimitReached?: (req: Request, res: Response, result: any) => void;
    rule?: Partial<RateLimitRule>;
  }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip rate limiting if conditions are met
      if (options?.skipIf && options.skipIf(req)) {
        return next();
      }

      // Generate identifier for rate limiting
      const identifier = options?.keyGenerator ? 
        options.keyGenerator(req) : 
        req.ip || req.connection.remoteAddress || 'unknown';

      // Check rate limit
      const result = await rateLimitingService.checkRateLimit(identifier, options?.rule);

      // Set rate limit headers
      res.set('X-RateLimit-Limit', result.limit.toString());
      res.set('X-RateLimit-Remaining', result.remaining.toString());
      res.set('X-RateLimit-Reset', Math.ceil(result.resetTime.getTime() / 1000).toString());

      if (!result.allowed) {
        if (result.retryAfter) {
          res.set('Retry-After', result.retryAfter.toString());
        }

        if (options?.onLimitReached) {
          options.onLimitReached(req, res, result);
        }

        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: result.retryAfter,
          limit: result.limit,
          resetTime: result.resetTime.toISOString()
        });
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Rate limit middleware error');
      // Fail open - allow request if rate limiting fails
      next();
    }
  };
}

/**
 * Session Management Middleware
 */
export function sessionMiddleware(
  sessionService: SessionService,
  options?: {
    cookieName?: string;
    headerName?: string;
    required?: boolean;
    autoExtend?: boolean;
  }
) {
  const config = {
    cookieName: 'session_id',
    headerName: 'Authorization',
    required: false,
    autoExtend: true,
    ...options
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract session ID from cookie or header
      let sessionId: string | undefined;
      
      if (config.headerName && req.headers[config.headerName.toLowerCase()]) {
        const authHeader = req.headers[config.headerName.toLowerCase()] as string;
        // Extract from Bearer token format
        if (authHeader.startsWith('Bearer ')) {
          sessionId = authHeader.substring(7);
        } else {
          sessionId = authHeader;
        }
      }
      
      if (!sessionId && config.cookieName && req.cookies) {
        sessionId = req.cookies[config.cookieName];
      }

      if (sessionId) {
        // Validate session
        const validation = await sessionService.validateSession(sessionId);
        
        if (validation.isValid && validation.session) {
          // Attach session data to request
          (req as any).session = validation.session;
          (req as any).user = {
            id: validation.session.userId,
            email: validation.session.email,
            roles: validation.session.roles,
            permissions: validation.session.permissions
          };

          // Set session cookie if using cookies
          if (config.cookieName) {
            res.cookie(config.cookieName, sessionId, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });
          }
        } else if (config.required) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: validation.reason || 'Invalid session'
          });
        }
      } else if (config.required) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Session required'
        });
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Session middleware error');
      
      if (config.required) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Session validation failed'
        });
      }
      
      next();
    }
  };
}

/**
 * Cache Headers Middleware
 */
export function cacheHeadersMiddleware(options?: {
  maxAge?: number;
  public?: boolean;
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  etag?: boolean;
  lastModified?: boolean;
}) {
  const config = {
    maxAge: 300, // 5 minutes
    public: true,
    mustRevalidate: false,
    noCache: false,
    noStore: false,
    etag: true,
    lastModified: true,
    ...options
  };

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Build Cache-Control header
      const cacheControlParts: string[] = [];
      
      if (config.noCache) {
        cacheControlParts.push('no-cache');
      } else if (config.noStore) {
        cacheControlParts.push('no-store');
      } else {
        if (config.public) {
          cacheControlParts.push('public');
        } else {
          cacheControlParts.push('private');
        }
        
        cacheControlParts.push(`max-age=${config.maxAge}`);
        
        if (config.mustRevalidate) {
          cacheControlParts.push('must-revalidate');
        }
      }

      res.set('Cache-Control', cacheControlParts.join(', '));

      // Set ETag header if enabled
      if (config.etag) {
        const originalJson = res.json;
        res.json = function(body: any) {
          const etag = `"${Buffer.from(JSON.stringify(body)).toString('base64')}"`;
          res.set('ETag', etag);
          return originalJson.call(this, body);
        };
      }

      // Set Last-Modified header if enabled
      if (config.lastModified) {
        res.set('Last-Modified', new Date().toUTCString());
      }

      next();
    } catch (error) {
      logger.error({ error }, 'Cache headers middleware error');
      next();
    }
  };
}

/**
 * Cache Invalidation Middleware
 */
export function cacheInvalidationMiddleware(
  invalidationService: any, // CacheInvalidationService
  options?: {
    events?: Array<{
      method: string | string[];
      path: string | RegExp;
      eventType: string;
      dataExtractor?: (req: Request, res: Response) => any;
    }>;
  }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Store original res.json to intercept successful responses
      const originalJson = res.json;
      res.json = function(body: any) {
        // Check if we should trigger invalidation events
        if (options?.events && res.statusCode >= 200 && res.statusCode < 300) {
          for (const event of options.events) {
            const methods = Array.isArray(event.method) ? event.method : [event.method];
            
            // Check if method matches
            if (!methods.includes(req.method)) {
              continue;
            }

            // Check if path matches
            let pathMatches = false;
            if (typeof event.path === 'string') {
              pathMatches = req.path === event.path;
            } else if (event.path instanceof RegExp) {
              pathMatches = event.path.test(req.path);
            }

            if (pathMatches) {
              // Extract data for invalidation
              const data = event.dataExtractor ? 
                event.dataExtractor(req, res) : 
                { ...req.params, ...req.query, body: req.body };

              // Trigger invalidation asynchronously
              invalidationService.triggerInvalidation(event.eventType, data, 'middleware')
                .catch((error: any) => {
                  logger.error({ error, eventType: event.eventType }, 'Failed to trigger cache invalidation');
                });
            }
          }
        }

        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      logger.error({ error }, 'Cache invalidation middleware error');
      next();
    }
  };
}

/**
 * Comprehensive cache middleware factory
 */
export function createCacheMiddleware(config: CacheMiddlewareConfig) {
  return {
    /**
     * API response caching
     */
    apiCache: (rule?: CacheRule) => {
      if (!config.apiCacheService) {
        throw new Error('ApiCacheService not configured');
      }
      return apiCacheMiddleware(config.apiCacheService);
    },

    /**
     * Rate limiting
     */
    rateLimit: (rule?: Partial<RateLimitRule>) => {
      if (!config.rateLimitingService) {
        throw new Error('RateLimitingService not configured');
      }
      return rateLimitMiddleware(config.rateLimitingService, { rule });
    },

    /**
     * Session management
     */
    session: (required: boolean = false) => {
      if (!config.sessionService) {
        throw new Error('SessionService not configured');
      }
      return sessionMiddleware(config.sessionService, { required });
    },

    /**
     * Cache headers
     */
    headers: (maxAge: number = 300) => cacheHeadersMiddleware({ maxAge }),

    /**
     * Combined middleware for common API patterns
     */
    api: (options?: {
      cache?: boolean;
      rateLimit?: boolean;
      session?: boolean;
      maxAge?: number;
      rateLimitRule?: Partial<RateLimitRule>;
    }) => {
      const middlewares: any[] = [];

      if (options?.session && config.sessionService) {
        middlewares.push(sessionMiddleware(config.sessionService));
      }

      if (options?.rateLimit && config.rateLimitingService) {
        middlewares.push(rateLimitMiddleware(config.rateLimitingService, {
          rule: options.rateLimitRule
        }));
      }

      if (options?.cache && config.apiCacheService) {
        middlewares.push(apiCacheMiddleware(config.apiCacheService));
      } else {
        middlewares.push(cacheHeadersMiddleware({ 
          maxAge: options?.maxAge || 300 
        }));
      }

      return middlewares;
    }
  };
}

/**
 * Cache-aware request helper
 */
export class CacheAwareRequest {
  constructor(private cacheService: CacheService) {}

  /**
   * Get data with cache-aside pattern
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 300
  ): Promise<T | null> {
    return this.cacheService.getOrSet(key, fetcher, ttl);
  }

  /**
   * Invalidate cache after operation
   */
  async invalidateAfter<T>(
    operation: () => Promise<T>,
    keys: string | string[]
  ): Promise<T> {
    try {
      const result = await operation();
      
      // Invalidate cache after successful operation
      const keyList = Array.isArray(keys) ? keys : [keys];
      await this.cacheService.mdel(keyList);
      
      return result;
    } catch (error) {
      // Don't invalidate cache if operation failed
      throw error;
    }
  }

  /**
   * Cache result of operation
   */
  async cacheResult<T>(
    key: string,
    operation: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    const result = await operation();
    
    if (result !== null && result !== undefined) {
      await this.cacheService.set(key, result, ttl);
    }
    
    return result;
  }
}