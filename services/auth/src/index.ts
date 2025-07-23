import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import pino from 'pino';

import { AuthController } from './controllers/auth-controller.js';
import { authenticateMiddleware } from './middleware/auth-middleware.js';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'auth-service' });
const env = validateEnv();

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL || 'info',
      transport: env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      } : undefined
    }
  });

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production' 
      ? [env.FRONTEND_URL, env.API_GATEWAY_URL].filter(Boolean)
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With', 
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Tenant-ID',
      'X-Device-ID',
      'X-Device-Name'
    ]
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'], // Allow localhost
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true
    }
  });

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
      expiresIn: '1h'
    },
    verify: {
      algorithms: ['HS256']
    }
  });

  await fastify.register(cookie, {
    secret: env.COOKIE_SECRET || env.JWT_SECRET,
    hook: 'onRequest',
    parseOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  });

  // Register authentication decorator
  fastify.decorate('authenticate', authenticateMiddleware);

  // Register routes
  const authController = new AuthController();
  await authController.registerRoutes(fastify);

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error({
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      ip: request.ip
    }, 'Unhandled error');

    // Don't expose internal errors in production
    const isDevelopment = env.NODE_ENV === 'development';
    
    return reply.status(error.statusCode || 500).send({
      success: false,
      error: isDevelopment ? error.message : 'Internal server error',
      ...(isDevelopment && { stack: error.stack })
    });
  });

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      success: false,
      error: 'Route not found',
      path: request.url,
      method: request.method
    });
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    
    try {
      await fastify.close();
      logger.info('Server closed successfully');
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
    const server = await buildServer();
    
    const port = parseInt(env.AUTH_SERVICE_PORT || '8001', 10);
    const host = env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    logger.info({
      port,
      host,
      environment: env.NODE_ENV,
      nodeVersion: process.version
    }, 'Auth service started successfully');

  } catch (error) {
    logger.error({ error }, 'Failed to start auth service');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };