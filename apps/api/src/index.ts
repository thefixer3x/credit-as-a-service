import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from 'dotenv';

import { logger } from './utils/logger';
import { testConnection } from './db/connection';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { loanRoutes } from './routes/loans';
import { paymentRoutes } from './routes/payments';
import { creditRoutes } from './routes/credit';
import { adminRoutes } from './routes/admin';

// Load environment variables
config();

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    stream: {
      write: (msg: string) => {
        logger.info(msg.trim());
      }
    }
  },
  trustProxy: true,
  requestTimeout: 30000,
});

// Register plugins
async function registerPlugins() {
  // Security
  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });
  
  await fastify.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 hour',
    redis: process.env.REDIS_URL ? { url: process.env.REDIS_URL } : undefined
  });

  // JWT
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    cookie: {
      cookieName: 'token',
      signed: false
    }
  });

  // Cookie support
  await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'your-cookie-secret',
    parseOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  });

  // Multipart support for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 5
    }
  });

  // API Documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'CAAS Platform API',
        description: 'Credit-as-a-Service Platform REST API',
        version: '1.0.0'
      },
      host: process.env.API_HOST || 'localhost:8000',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        apiKey: {
          type: 'apiKey',
          name: 'x-api-key',
          in: 'header'
        },
        bearerAuth: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header'
        }
      }
    }
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });
}

// Register routes
async function registerRoutes() {
  // Health check
  fastify.get('/health', async (request, reply) => {
    const dbHealthy = await testConnection();
    const health = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: dbHealthy ? 'connected' : 'disconnected'
    };
    
    return reply.status(dbHealthy ? 200 : 503).send(health);
  });

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(userRoutes, { prefix: '/api/users' });
  await fastify.register(loanRoutes, { prefix: '/api/loans' });
  await fastify.register(paymentRoutes, { prefix: '/api/payments' });
  await fastify.register(creditRoutes, { prefix: '/api/credit' });
  await fastify.register(adminRoutes, { prefix: '/api/admin' });
}

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    requestId: request.id,
    url: request.url,
    method: request.method
  });

  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation
    });
  }

  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: error.name,
      message: error.message
    });
  }

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Not found handler
fastify.setNotFoundHandler((request, reply) => {
  return reply.status(404).send({
    error: 'Not Found',
    message: `Route ${request.method}:${request.url} not found`
  });
});

// Start server
const start = async () => {
  try {
    await registerPlugins();
    await registerRoutes();
    
    const port = parseInt(process.env.PORT || '8000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    logger.info(`🚀 CAAS Platform API server started on http://${host}:${port}`);
    logger.info(`📚 API Documentation: http://${host}:${port}/docs`);
    logger.info(`❤️ Health Check: http://${host}:${port}/health`);
    
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, gracefully closing server...');
  try {
    await fastify.close();
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
start();