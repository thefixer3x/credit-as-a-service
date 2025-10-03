import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';

import { validateEnv } from '@caas/config';
import { errorHandler, notFoundHandler } from '@caas/common';
import { RiskEngine } from './services/risk-engine.js';
import { RiskController } from './controllers/risk-controller.js';
import { createRiskRoutes } from './routes/risk-routes.js';

const logger = pino({ name: 'risk-service' });
const env = validateEnv();

async function startServer() {
  try {
    const app = fastify({
      logger: logger,
      trustProxy: true,
    });

    const PORT = env.RISK_SERVICE_PORT || 3005;

    // Initialize services
    const riskEngine = new RiskEngine(logger);
    const controller = new RiskController(riskEngine, logger);

    // Register plugins
    await app.register(cors, {
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    });

    await app.register(helmet);

    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Risk Assessment Service API',
          description: 'AI-powered risk assessment and credit scoring service',
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
        service: 'risk-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
      };
    });

    // API routes
    await app.register(createRiskRoutes(controller), { prefix: '/api/v1/risk' });

    // Error handling
    app.setErrorHandler(errorHandler);
    app.setNotFoundHandler(notFoundHandler);

    // Start server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'Risk service started');

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
    logger.error('Failed to start risk service:', error);
    process.exit(1);
  }
}

startServer();
