import Fastify, { FastifyInstance } from 'fastify';
import { WebSocketManager } from './realtime/websocket-server';
import { NotificationService } from './services/notification-service';
import { errorHandler, notFoundHandler } from '@caas/common';
import { eventBus, eventHandlerRegistry } from './events/event-bus';
import './events/event-handlers'; // Register handlers

// Keep existing imports for backward compatibility
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { validateEnv } from '@caas/config';
import { initializeCache } from '@caas/cache';

import { NotificationsEngine } from './services/notifications-engine.js';
import { NotificationsController } from './controllers/notifications-controller.js';
import { createNotificationsRoutes } from './routes/notifications-routes.js';

const logger = pino({ name: 'notifications-service' });
const env = validateEnv();

async function startServer() {
  try {
    // Initialize Fastify for WebSocket support
    const fastify = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV === 'development' ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        } : undefined,
      },
    });

    // Initialize WebSocket Manager and Notification Service
    const wsManager = new WebSocketManager(fastify);
    const notificationService = new NotificationService(wsManager, fastify.log);
    await wsManager.initialize();

    // Connect EventBus to WebSocket Manager
    eventBus.setWebSocketManager(wsManager);

    // Set up event handlers
    eventBus.on('*', async (event) => {
      await eventHandlerRegistry.handle(event);
    });

    // Register Fastify CORS
    await fastify.register(require('@fastify/cors'), {
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    });

    // Existing Express app for backward compatibility
    const app = express();
    const PORT = env.NOTIFICATIONS_SERVICE_PORT || 3009;
    const WS_PORT = env.NOTIFICATIONS_WS_PORT || 3010;

    // Initialize cache
    const { cacheService } = await initializeCache({
      redis: {
        host: env.REDIS_HOST,
        port: parseInt(env.REDIS_PORT || '6379'),
        password: env.REDIS_PASSWORD,
        keyPrefix: 'notifications:'
      }
    });

    // Initialize services
    const notificationsEngine = new NotificationsEngine(cacheService);
    const controller = new NotificationsController(notificationsEngine);

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
        service: 'notifications',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    app.use('/api/v1/notifications', createNotificationsRoutes(controller));

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Add real-time notification endpoints to Express app
    app.post('/api/v1/notifications/realtime', async (req, res) => {
      try {
        const notificationId = await notificationService.createNotification(req.body);
        res.json({ notificationId, message: 'Real-time notification sent' });
      } catch (error) {
        logger.error('Error sending real-time notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
      }
    });

    app.post('/api/v1/notifications/events', async (req, res) => {
      try {
        const event = {
          ...req.body,
          timestamp: new Date(),
        };
        await notificationService.handleEvent(event);
        res.json({ message: 'Event notification processed' });
      } catch (error) {
        logger.error('Error processing event notification:', error);
        res.status(500).json({ error: 'Failed to process event' });
      }
    });

    app.get('/api/v1/notifications/stats', (req, res) => {
      const stats = notificationService.getStats();
      const eventStats = eventBus.getEventStats();
      res.json({ 
        notifications: stats,
        events: eventStats,
        handlers: eventHandlerRegistry.getHandlers()
      });
    });

    // Event bus endpoints
    app.post('/api/v1/events/publish', async (req, res) => {
      try {
        await eventBus.publish(req.body);
        res.json({ message: 'Event published successfully' });
      } catch (error) {
        logger.error('Error publishing event:', error);
        res.status(500).json({ error: 'Failed to publish event' });
      }
    });

    app.get('/api/v1/events', (req, res) => {
      const { type, source, since, limit } = req.query;
      const events = eventBus.getEvents({
        type: type as string,
        source: source as string,
        since: since ? parseInt(since as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json(events);
    });

    // Start both servers
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Notifications HTTP service started');
    });

    await fastify.listen({ port: WS_PORT, host: '0.0.0.0' });
    logger.info({ port: WS_PORT }, 'Notifications WebSocket service started');

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
    logger.error({ error }, 'Failed to start notifications service');
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error({ error }, 'Unhandled error starting server');
  process.exit(1);
});

export default startServer;