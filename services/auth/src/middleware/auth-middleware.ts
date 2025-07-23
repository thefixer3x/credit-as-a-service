import type { FastifyRequest, FastifyReply } from 'fastify';
import pino from 'pino';
import { JWTPayload } from '../types/auth.js';

const logger = pino({ name: 'auth-middleware' });

/**
 * JWT Authentication middleware for Fastify
 */
export async function authenticateMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication token required',
        errorCode: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // In real implementation, verify JWT with proper library
    const payload = await verifyJWT(token);
    
    if (!payload) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid authentication token',
        errorCode: 'INVALID_TOKEN'
      });
    }

    // Check if token is expired
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication token expired',
        errorCode: 'TOKEN_EXPIRED'
      });
    }

    // Check if session is still active
    const isSessionActive = await checkSessionActive(payload.sessionId);
    if (!isSessionActive) {
      return reply.status(401).send({
        success: false,
        error: 'Session expired or revoked',
        errorCode: 'SESSION_INVALID'
      });
    }

    // Attach user info to request
    (request as any).user = payload;
    
    // Update session last used time
    await updateSessionLastUsed(payload.sessionId);

  } catch (error) {
    logger.error({ error }, 'Authentication middleware error');
    return reply.status(401).send({
      success: false,
      error: 'Authentication failed',
      errorCode: 'AUTH_ERROR'
    });
  }
}

/**
 * Permission-based authorization middleware
 */
export function requirePermissions(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user as JWTPayload;
      
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      // Check if user has required permissions
      const hasPermissions = permissions.every(permission => 
        user.permissions.includes(permission) || 
        user.creditPermissions?.includes(permission) ||
        user.permissions.includes('admin') ||
        user.creditPermissions?.includes('credit:admin:all')
      );

      if (!hasPermissions) {
        return reply.status(403).send({
          success: false,
          error: 'Insufficient permissions',
          errorCode: 'INSUFFICIENT_PERMISSIONS',
          requiredPermissions: permissions
        });
      }

    } catch (error) {
      logger.error({ error }, 'Permission middleware error');
      return reply.status(403).send({
        success: false,
        error: 'Authorization failed'
      });
    }
  };
}

/**
 * Role-based authorization middleware
 */
export function requireRoles(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user as JWTPayload;
      
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!roles.includes(user.role)) {
        return reply.status(403).send({
          success: false,
          error: 'Insufficient role privileges',
          errorCode: 'INSUFFICIENT_ROLE',
          requiredRoles: roles,
          userRole: user.role
        });
      }

    } catch (error) {
      logger.error({ error }, 'Role middleware error');
      return reply.status(403).send({
        success: false,
        error: 'Authorization failed'
      });
    }
  };
}

/**
 * KYC status validation middleware
 */
export function requireKYCStatus(requiredStatus: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user as JWTPayload;
      
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!requiredStatus.includes(user.kycStatus || 'unverified')) {
        return reply.status(403).send({
          success: false,
          error: 'KYC verification required',
          errorCode: 'KYC_REQUIRED',
          currentStatus: user.kycStatus,
          requiredStatus
        });
      }

    } catch (error) {
      logger.error({ error }, 'KYC middleware error');
      return reply.status(403).send({
        success: false,
        error: 'KYC validation failed'
      });
    }
  };
}

/**
 * Tenant isolation middleware
 */
export function requireTenant() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user as JWTPayload;
      const tenantId = request.headers['x-tenant-id'] as string;
      
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      // If tenant ID is provided in header, validate it matches user's tenant
      if (tenantId && tenantId !== user.tenantId) {
        return reply.status(403).send({
          success: false,
          error: 'Tenant access denied',
          errorCode: 'TENANT_MISMATCH'
        });
      }

      // Attach tenant ID to request for use in database queries
      (request as any).tenantId = user.tenantId;

    } catch (error) {
      logger.error({ error }, 'Tenant middleware error');
      return reply.status(403).send({
        success: false,
        error: 'Tenant validation failed'
      });
    }
  };
}

/**
 * API key authentication middleware
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const apiKey = request.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return reply.status(401).send({
        success: false,
        error: 'API key required',
        errorCode: 'MISSING_API_KEY'
      });
    }

    // Validate API key format (e.g., caas_live_xxxxx or caas_test_xxxxx)
    if (!apiKey.match(/^caas_(live|test)_[a-zA-Z0-9]{32}$/)) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid API key format',
        errorCode: 'INVALID_API_KEY_FORMAT'
      });
    }

    // In real implementation, validate API key against database
    const keyData = await validateApiKey(apiKey);
    
    if (!keyData) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid API key',
        errorCode: 'INVALID_API_KEY'
      });
    }

    if (!keyData.isActive) {
      return reply.status(401).send({
        success: false,
        error: 'API key is inactive',
        errorCode: 'API_KEY_INACTIVE'
      });
    }

    if (keyData.expiresAt && new Date() > keyData.expiresAt) {
      return reply.status(401).send({
        success: false,
        error: 'API key expired',
        errorCode: 'API_KEY_EXPIRED'
      });
    }

    // Check IP whitelist if configured
    if (keyData.ipWhitelist && keyData.ipWhitelist.length > 0) {
      const clientIp = request.ip;
      if (!keyData.ipWhitelist.includes(clientIp)) {
        return reply.status(403).send({
          success: false,
          error: 'IP address not whitelisted',
          errorCode: 'IP_NOT_WHITELISTED'
        });
      }
    }

    // Attach API key data to request
    (request as any).apiKey = keyData;
    
    // Update usage count
    await incrementApiKeyUsage(keyData.id);

  } catch (error) {
    logger.error({ error }, 'API key authentication error');
    return reply.status(401).send({
      success: false,
      error: 'API key authentication failed'
    });
  }
}

/**
 * Rate limiting based on user or API key
 */
export function createRateLimiter(options: {
  max: number;
  timeWindow: number;
  keyGenerator?: (request: FastifyRequest) => string;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let key: string;
      
      if (options.keyGenerator) {
        key = options.keyGenerator(request);
      } else {
        // Default key generation
        const user = (request as any).user as JWTPayload;
        const apiKey = (request as any).apiKey;
        
        if (user) {
          key = `user:${user.sub}`;
        } else if (apiKey) {
          key = `apikey:${apiKey.id}`;
        } else {
          key = `ip:${request.ip}`;
        }
      }

      // In real implementation, use Redis for rate limiting
      const isAllowed = await checkRateLimit(key, options.max, options.timeWindow);
      
      if (!isAllowed) {
        return reply.status(429).send({
          success: false,
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMIT_EXCEEDED'
        });
      }

    } catch (error) {
      logger.error({ error }, 'Rate limiting error');
      // Continue on rate limiting errors to avoid blocking requests
    }
  };
}

// Helper functions (would be implemented with actual database/Redis operations)
async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    // In real implementation, use proper JWT library
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

async function checkSessionActive(sessionId: string): Promise<boolean> {
  // Check if session exists and is active in database
  return true; // Simulate
}

async function updateSessionLastUsed(sessionId: string): Promise<void> {
  // Update session last used timestamp
}

async function validateApiKey(apiKey: string): Promise<any> {
  // Validate API key against database
  return {
    id: 'key-id',
    isActive: true,
    expiresAt: null,
    ipWhitelist: [],
    permissions: []
  };
}

async function incrementApiKeyUsage(keyId: string): Promise<void> {
  // Increment API key usage count
}

async function checkRateLimit(
  key: string, 
  max: number, 
  timeWindow: number
): Promise<boolean> {
  // Check rate limit using Redis
  return true; // Simulate
}