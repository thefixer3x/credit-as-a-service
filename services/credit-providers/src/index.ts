import fastify from 'fastify';
import { Logger } from '@caas/common';
import { Pool } from 'pg';
import { CreditProviderController } from './controllers/credit-provider-controller';
import { CreditProviderService } from './services/credit-provider-service';
import { LeadDistributionService } from './services/lead-distribution-service';
import { ProviderAnalyticsService } from './services/provider-analytics-service';
import { WebhookService } from './services/webhook-service';
import { NotificationService } from './services/notification-service';
import { CreditProviderRepository } from './repositories/credit-provider-repository';
import { LeadRepository } from './repositories/lead-repository';
import { AnalyticsRepository } from './repositories/analytics-repository';
import { EventPublisher } from '@caas/common';

const logger = new Logger({ serviceName: 'credit-providers-service' });

async function startServer() {
  try {
    // Initialize database connection
    const db = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test database connection
    await db.query('SELECT NOW()');
    logger.info('Database connection established');

    // Initialize repositories
    const creditProviderRepository = new CreditProviderRepository(logger, db);
    const leadRepository = new LeadRepository(logger, db);
    const analyticsRepository = new AnalyticsRepository(logger, db);

    // Initialize services
    const webhookService = new WebhookService(logger);
    const notificationService = new NotificationService(logger);
    const eventPublisher = new EventPublisher();

    const creditProviderService = new CreditProviderService(
      logger,
      creditProviderRepository,
      webhookService,
      notificationService
    );

    const leadDistributionService = new LeadDistributionService(
      logger,
      creditProviderRepository,
      leadRepository,
      webhookService,
      notificationService,
      eventPublisher
    );

    const providerAnalyticsService = new ProviderAnalyticsService(
      logger,
      creditProviderRepository,
      leadRepository,
      analyticsRepository
    );

    // Initialize Fastify server
    const server = fastify({
      logger: false, // Use our custom logger
      trustProxy: true,
    });

    // Register plugins
    await server.register(import('@fastify/cors'), {
      origin: process.env.NODE_ENV === 'production'
        ? ['https://admin.caas.platform.com', 'https://providers.caas.platform.com']
        : true,
      credentials: true,
    });

    await server.register(import('@fastify/jwt'), {
      secret: process.env.JWT_SECRET || 'your-secret-key',
    });

    await server.register(import('@fastify/swagger'), {
      swagger: {
        info: {
          title: 'Credit Providers API',
          description: 'API for managing credit providers and lead distribution',
          version: '1.0.0',
        },
        host: process.env.API_HOST || 'localhost:3008',
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'Credit Providers', description: 'Provider registration and management' },
          { name: 'Lead Distribution', description: 'Lead distribution and management' },
          { name: 'Provider Analytics', description: 'Analytics and reporting' },
          { name: 'API Plugins', description: 'API plugin management' },
          { name: 'Webhooks', description: 'Webhook management' },
          { name: 'Admin - Credit Providers', description: 'Admin provider management' },
          { name: 'Admin - Analytics', description: 'Admin analytics' },
        ],
      },
    });

    await server.register(import('@fastify/swagger-ui'), {
      routePrefix: '/documentation',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });

    // Add authentication decorators
    server.decorate('authenticate', async function(request: any, reply: any) {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    });

    server.decorate('authorize', function(allowedRoles: string[]) {
      return async function(request: any, reply: any) {
        if (!request.user || !allowedRoles.includes(request.user.role)) {
          reply.status(403).send({
            success: false,
            message: 'Insufficient permissions'
          });
        }
      };
    });

    // Initialize controller
    const creditProviderController = new CreditProviderController(
      logger,
      creditProviderService,
      leadDistributionService,
      providerAnalyticsService
    );

    // Register routes
    await creditProviderController.registerRoutes(server);

    // Health check endpoint
    server.get('/health', async () => {
      try {
        await db.query('SELECT 1');
        return {
          status: 'healthy',
          service: 'credit-providers',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
        };
      } catch (error) {
        throw new Error('Database connection failed');
      }
    });

    // Metrics endpoint
    server.get('/metrics', async () => {
      const totalProviders = await creditProviderRepository.findMany({ limit: 1 });
      const activeProviders = await creditProviderRepository.findMany({ 
        status: 'active', 
        limit: 1 
      });

      return {
        total_providers: totalProviders.total,
        active_providers: activeProviders.total,
        timestamp: new Date().toISOString(),
      };
    });

    // Error handling
    server.setErrorHandler((error, request, reply) => {
      logger.error('Server error', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
      });

      const statusCode = error.statusCode || 500;
      const message = error.message || 'Internal Server Error';

      reply.status(statusCode).send({
        success: false,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // Start server
    const port = parseInt(process.env.PORT || '3008');
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    
    logger.info(`Credit Providers service started on ${host}:${port}`);
    logger.info(`Documentation available at http://${host}:${port}/documentation`);

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await server.close();
        await db.end();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Unhandled error during startup', { error });
  process.exit(1);
});