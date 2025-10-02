import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';

import { validateEnv } from '@caas/config';
import { errorHandler, notFoundHandler } from '@caas/common';
import { ComplianceEngine } from './services/compliance-engine.js';
import { ComplianceController } from './controllers/compliance-controller.js';
import { createComplianceRoutes } from './routes/compliance-routes.js';

const logger = pino({ name: 'compliance-service' });
const env = validateEnv();

async function startServer() {
  try {
    const app = fastify({
      logger: logger,
      trustProxy: true,
    });

    const PORT = env.COMPLIANCE_SERVICE_PORT || 3006;

    // Initialize services
    const complianceEngine = new ComplianceEngine(logger);
    const controller = new ComplianceController(complianceEngine, logger);

    // Register plugins
    await app.register(cors, {
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    });

    await app.register(helmet);

    await app.register(rateLimit, {
      max: 50,
      timeWindow: '1 minute',
    });

    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Compliance Service API',
          description: 'KYC/AML and regulatory compliance service',
          version: '1.0.0',
        },
        servers: [
          {
            url: `http://localhost:${PORT}`,
            description: 'Development server',
          },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });

    // Health check endpoint
    app.get('/health', async (request, reply) => {
      return {
        service: 'compliance-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
      };
    });

    // API routes
    await app.register(createComplianceRoutes(controller), { prefix: '/api/v1/compliance' });

    // Error handling
    app.setErrorHandler(errorHandler);
    app.setNotFoundHandler(notFoundHandler);

    // Start server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'Compliance service started');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start compliance service:', error);
    process.exit(1);
  }
}

startServer();
