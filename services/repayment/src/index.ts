import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { validateEnv } from '@caas/config';
import { errorHandler, notFoundHandler } from '@caas/common';
import { initializeCache } from '@caas/cache';

import { RepaymentEngine } from './services/repayment-engine.js';
import { RepaymentController } from './controllers/repayment-controller.js';
import { createRepaymentRoutes } from './routes/repayment-routes.js';

const logger = pino({ name: 'repayment-service' });
const env = validateEnv();

async function startServer() {
  try {
    const app = express();
    const PORT = env.REPAYMENT_SERVICE_PORT || 3006;

    // Initialize cache
    const { cacheService } = await initializeCache({
      redis: {
        host: env.REDIS_HOST,
        port: parseInt(env.REDIS_PORT || '6379'),
        password: env.REDIS_PASSWORD,
        keyPrefix: 'repayment:'
      }
    });

    // Initialize services
    const repaymentEngine = new RepaymentEngine(cacheService);
    const controller = new RepaymentController(repaymentEngine);

    // Middleware
    app.use(helmet());
    app.use(cors({
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging middleware
    app.use(pinoHttp({ logger }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        service: 'repayment',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    app.use('/api/v1/repayment', createRepaymentRoutes(controller));

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Start server
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Repayment service started');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      process.exit(0);
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start repayment service');
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error({ error }, 'Unhandled error starting server');
  process.exit(1);
});

export default startServer;