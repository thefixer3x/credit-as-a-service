import { z } from 'zod';

/**
 * API Gateway Types
 *
 * Gateway-specific infrastructure types for routing, rate limiting, circuit breaking, etc.
 * For domain-specific types (payments, credit, users), import from @caas/types:
 *
 * @example
 * import type { DisbursementRequest, CreditAssessmentResult } from '@caas/types';
 */

// Service registry types
export interface ServiceConfig {
  name: string;
  version: string;
  baseUrl: string;
  healthCheckPath: string;
  timeout: number;
  retries: number;
  circuitBreaker: {
    enabled: boolean;
    threshold: number;
    timeout: number;
    resetTimeout: number;
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    timeWindow: number;
  };
  authentication: {
    required: boolean;
    methods: ('jwt' | 'api-key' | 'basic')[];
    permissions?: string[];
  };
}

export interface RouteConfig {
  path: string;
  method: string;
  service: string;
  target: string;
  stripPrefix?: boolean;
  rewritePath?: string;
  timeout?: number;
  authentication?: {
    required: boolean;
    permissions?: string[];
    roles?: string[];
  };
  rateLimit?: {
    max: number;
    timeWindow: number;
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    varyBy?: ('user' | 'query' | 'headers')[];
  };
  transformation?: {
    request?: RequestTransformation;
    response?: ResponseTransformation;
  };
}

export interface RequestTransformation {
  headers?: {
    add?: Record<string, string>;
    remove?: string[];
    rename?: Record<string, string>;
  };
  body?: {
    transform?: string; // JSONPath or similar transformation rule
  };
}

export interface ResponseTransformation {
  headers?: {
    add?: Record<string, string>;
    remove?: string[];
  };
  body?: {
    transform?: string;
    filter?: string[];
  };
}

// Request/Response logging types
export interface RequestLog {
  id: string;
  tenantId?: string;
  userId?: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, string>;
  body?: any;
  userAgent: string;
  ipAddress: string;
  timestamp: Date;
  correlationId: string;
  sessionId?: string;
  apiKeyId?: string;
  service?: string;
  route?: string;
}

export interface ResponseLog {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  responseTime: number;
  timestamp: Date;
  error?: string;
  cached?: boolean;
}

// Rate limiting types
export interface RateLimitConfig {
  identifier: string; // user ID, API key, IP, etc.
  max: number;
  timeWindow: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (request: any) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

// Circuit breaker types
export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  successCount?: number;
}

// Load balancing types
export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    unhealthyThreshold: number;
    healthyThreshold: number;
  };
}

export interface ServiceInstance {
  id: string;
  url: string;
  weight?: number;
  healthy: boolean;
  connections: number;
  lastHealthCheck?: Date;
  metadata?: Record<string, any>;
}

// Analytics and monitoring types
export interface MetricEvent {
  type: 'request' | 'response' | 'error' | 'rate_limit' | 'circuit_breaker';
  service?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  userId?: string;
  tenantId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  errorRate: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

// API documentation types
export interface APIDocumentation {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
    securitySchemes: Record<string, any>;
  };
}

// Transformation schemas
export const requestTransformationSchema = z.object({
  headers: z.object({
    add: z.record(z.string()).optional(),
    remove: z.array(z.string()).optional(),
    rename: z.record(z.string()).optional()
  }).optional(),
  body: z.object({
    transform: z.string().optional()
  }).optional()
});

export const responseTransformationSchema = z.object({
  headers: z.object({
    add: z.record(z.string()).optional(),
    remove: z.array(z.string()).optional()
  }).optional(),
  body: z.object({
    transform: z.string().optional(),
    filter: z.array(z.string()).optional()
  }).optional()
});

export const routeConfigSchema = z.object({
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
  service: z.string(),
  target: z.string(),
  stripPrefix: z.boolean().optional(),
  rewritePath: z.string().optional(),
  timeout: z.number().positive().optional(),
  authentication: z.object({
    required: z.boolean(),
    permissions: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional()
  }).optional(),
  rateLimit: z.object({
    max: z.number().positive(),
    timeWindow: z.number().positive()
  }).optional(),
  cache: z.object({
    enabled: z.boolean(),
    ttl: z.number().positive(),
    varyBy: z.array(z.enum(['user', 'query', 'headers'])).optional()
  }).optional(),
  transformation: z.object({
    request: requestTransformationSchema.optional(),
    response: responseTransformationSchema.optional()
  }).optional()
});

// Gateway configuration
export interface GatewayConfig {
  services: Record<string, ServiceConfig>;
  routes: RouteConfig[];
  globalRateLimit: RateLimitConfig;
  cors: {
    origin: string | string[];
    methods: string[];
    headers: string[];
    credentials: boolean;
  };
  security: {
    jwt: {
      secret: string;
      algorithm: string;
      expiresIn: string;
    };
    apiKeys: {
      headerName: string;
      queryName?: string;
    };
    rateLimiting: {
      enabled: boolean;
      redis?: {
        host: string;
        port: number;
        password?: string;
      };
    };
  };
  monitoring: {
    enabled: boolean;
    metrics: {
      enabled: boolean;
      endpoint: string;
    };
    tracing: {
      enabled: boolean;
      serviceName: string;
    };
    logging: {
      level: string;
      requestBody: boolean;
      responseBody: boolean;
    };
  };
}

// Error types
export interface GatewayError {
  code: string;
  message: string;
  statusCode: number;
  service?: string;
  route?: string;
  timestamp: Date;
  correlationId: string;
  details?: Record<string, any>;
}

// Plugin system types
export interface Plugin {
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, any>;
  hooks: {
    onRequest?: (request: any) => Promise<any>;
    onResponse?: (response: any) => Promise<any>;
    onError?: (error: any) => Promise<any>;
  };
}

// Type exports
export type RequestTransformationType = z.infer<typeof requestTransformationSchema>;
export type ResponseTransformationType = z.infer<typeof responseTransformationSchema>;
export type RouteConfigType = z.infer<typeof routeConfigSchema>;