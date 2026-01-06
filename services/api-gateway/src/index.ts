import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import proxy from '@fastify/http-proxy';
import compress from '@fastify/compress';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

import { ServiceRegistry } from './services/service-registry.js';
import { RouteConfig } from './types/gateway.js';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'api-gateway' });
const env = validateEnv();

async function buildGateway() {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL || 'info',
      transport: env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      } : undefined
    },
    genReqId: () => uuidv4(),
    trustProxy: true
  });

  // Initialize service registry
  const serviceRegistry = new ServiceRegistry();

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false
  });

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production' 
      ? (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Tenant-ID',
      'X-Device-ID',
      'X-Device-Name',
      'X-Correlation-ID'
    ]
  });

  await fastify.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['gzip', 'deflate']
  });

  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true
    },
    keyGenerator: (request) => {
      // Use API key, user ID, or IP for rate limiting
      const apiKey = request.headers['x-api-key'];
      const auth = request.headers.authorization;
      
      if (apiKey) return `api:${apiKey}`;
      if (auth) {
        // Extract user ID from JWT (simplified)
        try {
          const token = auth.replace('Bearer ', '');
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          return `user:${payload.sub}`;
        } catch {
          // Fall back to IP
        }
      }
      
      return `ip:${request.ip}`;
    }
  });

  await fastify.register(swagger as any, {
    swagger: {
      info: {
        title: 'Credit-as-a-Service API Gateway',
        description: 'Enterprise API Gateway for CaaS Platform',
        version: '1.0.0',
        contact: {
          name: 'CaaS Platform Team',
          email: 'support@caas-platform.com'
        }
      },
      host: env.API_GATEWAY_HOST || 'localhost:8000',
      schemes: [env.NODE_ENV === 'production' ? 'https' : 'http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header'
        }
      },
      security: [
        { bearerAuth: [] },
        { apiKey: [] }
      ]
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // Request correlation and logging middleware
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || request.id;
    request.headers['x-correlation-id'] = correlationId;
    
    // Add request start time for response time calculation
    (request as any).startTime = Date.now();
    
    // Log incoming request
    logger.info({
      correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      headers: request.headers
    }, 'Incoming request');
  });

  // Response logging middleware
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = Date.now() - ((request as any).startTime || 0);
    
    logger.info({
      correlationId: request.headers['x-correlation-id'],
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`
    }, 'Request completed');
  });

  // Define route configurations
  const routes: RouteConfig[] = [
    // Authentication service routes
    {
      path: '/auth/*',
      method: 'ALL',
      service: 'auth-service',
      target: '/auth/*',
      stripPrefix: false,
      authentication: { required: false }
    },
    
    // Credit application routes
    {
      path: '/credit/applications/*',
      method: 'ALL',
      service: 'underwriting-service',
      target: '/applications/*',
      stripPrefix: true,
      authentication: {
        required: true,
        permissions: ['credit:application:create', 'credit:application:view']
      },
      rateLimit: { max: 100, timeWindow: 60000 }
    },
    
    // Disbursement routes
    {
      path: '/credit/disbursements/*',
      method: 'ALL',
      service: 'disbursement-service',
      target: '/disbursements/*',
      stripPrefix: true,
      authentication: {
        required: true,
        permissions: ['credit:disbursement:execute', 'credit:disbursement:view']
      },
      rateLimit: { max: 50, timeWindow: 60000 }
    },
    
    // Repayment routes
    {
      path: '/credit/repayments/*',
      method: 'ALL',
      service: 'repayment-service',
      target: '/repayments/*',
      stripPrefix: true,
      authentication: {
        required: true,
        permissions: ['credit:repayment:process', 'credit:repayment:view']
      },
      rateLimit: { max: 200, timeWindow: 60000 }
    },
    
    // Notification routes
    {
      path: '/notifications/*',
      method: 'ALL',
      service: 'notifications-service',
      target: '/notifications/*',
      stripPrefix: false,
      authentication: { required: true },
      rateLimit: { max: 500, timeWindow: 60000 }
    },
    
    // Blockchain/Smart contract routes
    {
      path: '/blockchain/*',
      method: 'ALL',
      service: 'blockchain-service',
      target: '/blockchain/*',
      stripPrefix: false,
      authentication: {
        required: true,
        permissions: ['credit:admin:all']
      },
      rateLimit: { max: 20, timeWindow: 60000 }
    },
    
    // SME integration proxy routes
    {
      path: '/sme/*',
      method: 'ALL',
      service: 'sme-integration',
      target: '/v1/*',
      stripPrefix: true,
      authentication: { required: true },
      rateLimit: { max: 1000, timeWindow: 60000 }
    }
  ];

  // Register proxy routes
  for (const route of routes) {
    const service = serviceRegistry.getService(route.service);
    if (!service) {
      logger.warn({ route: route.path, service: route.service }, 'Service not found for route');
      continue;
    }

    await fastify.register(async (fastify) => {
      // Register route-specific middleware
      if (route.authentication?.required) {
        fastify.addHook('preHandler', async (request, reply) => {
          // Authentication logic would go here
          // For now, just check for authorization header
          const auth = request.headers.authorization;
          if (!auth || !auth.startsWith('Bearer ')) {
            return reply.status(401).send({
              error: 'Authentication required',
              code: 'UNAUTHORIZED'
            });
          }
        });
      }

      if (route.rateLimit) {
        await fastify.register(rateLimit, {
          max: route.rateLimit.max,
          timeWindow: route.rateLimit.timeWindow
        });
      }

      // Register the proxy
      await fastify.register(proxy as any, {
        upstream: service.baseUrl,
        prefix: route.path,
        rewritePrefix: route.target,
        http2: false,
        undici: {
          connectTimeout: service.timeout || 30000,
          requestTimeout: service.timeout || 30000
        },
        preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
          // Add correlation ID to upstream request
          request.headers['x-correlation-id'] = request.headers['x-correlation-id'] || request.id;
          request.headers['x-gateway-source'] = 'caas-gateway';
          
          // Record service call start
          (request as any).serviceCallStart = Date.now();
        },
        onResponse: async (request: FastifyRequest, reply: FastifyReply, res: any) => {
          // Record service call metrics
          const responseTime = Date.now() - ((request as any).serviceCallStart || 0);
          const success = res.statusCode < 400;
          
          serviceRegistry.recordServiceCall(route.service, success, responseTime);
          
          if (!success) {
            logger.warn({
              service: route.service,
              statusCode: res.statusCode,
              responseTime,
              url: request.url
            }, 'Service call failed');
          }
        },
        onError: async (request: FastifyRequest, reply: FastifyReply, error: any) => {
          logger.error({
            service: route.service,
            error: error.message,
            url: request.url
          }, 'Service proxy error');
          
          serviceRegistry.recordServiceCall(route.service, false, 0);
          
          return reply.status(503).send({
            error: 'Service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE',
            service: route.service
          });
        }
      });
    });
  }

  // Gateway management routes
  fastify.get('/gateway/health', {
    schema: {
      description: 'Gateway health check',
      tags: ['Gateway'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            services: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const services = serviceRegistry.getAllServiceHealth();
    const overallStatus = services.every(s => s.status === 'healthy') ? 'healthy' : 'degraded';
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: services.reduce((acc, service) => {
        acc[service.service] = {
          status: service.status,
          responseTime: service.responseTime,
          lastCheck: service.lastCheck
        };
        return acc;
      }, {} as Record<string, any>)
    };
  });

  fastify.get('/gateway/services', {
    schema: {
      description: 'List all registered services',
      tags: ['Gateway'],
      response: {
        200: {
          type: 'object',
          properties: {
            services: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return {
      services: serviceRegistry.getServiceDiscovery()
    };
  });

  fastify.get('/gateway/metrics', {
    schema: {
      description: 'Gateway metrics',
      tags: ['Gateway']
    }
  }, async (request, reply) => {
    return {
      gateway: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
      },
      services: serviceRegistry.getAllServiceHealth()
    };
  });

  // Error handlers
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      correlationId: request.headers['x-correlation-id']
    }, 'Gateway error');

    const isDevelopment = env.NODE_ENV === 'development';
    
    return reply.status(error.statusCode || 500).send({
      error: isDevelopment ? error.message : 'Internal server error',
      code: 'GATEWAY_ERROR',
      correlationId: request.headers['x-correlation-id'],
      ...(isDevelopment && { stack: error.stack })
    });
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'Route not found',
      code: 'NOT_FOUND',
      path: request.url,
      method: request.method,
      correlationId: request.headers['x-correlation-id']
    });
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    
    try {
      await fastify.close();
      logger.info('Gateway closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return fastify;
}

async function start() {
  try {
    const gateway = await buildGateway();
    
    const port = env.API_GATEWAY_PORT ?? 8000;
    const host = env.HOST || '0.0.0.0';
    
    await gateway.listen({ port, host });
    
    logger.info({
      port,
      host,
      environment: env.NODE_ENV,
      nodeVersion: process.version,
      docsUrl: `http://${host}:${port}/docs`
    }, 'API Gateway started successfully');

  } catch (error) {
    logger.error({ error }, 'Failed to start API Gateway');
    process.exit(1);
  }
}

// Start gateway if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildGateway };