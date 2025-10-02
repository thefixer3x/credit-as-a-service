import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Kafka } from 'kafkajs';
import { validateEnv } from '@caas/config';
import { errorHandler, notFoundHandler } from '@caas/common';
import { EventProducer } from './producers/event-producer.js';
import { EventConsumer } from './consumers/event-consumer.js';
import { EventRegistry } from './events/event-registry.js';
import { createKafkaRoutes } from './routes/kafka-routes.js';

const logger = pino({ name: 'kafka-service' });
const env = validateEnv();

async function startServer() {
  try {
    const app = express();
    const PORT = env.KAFKA_SERVICE_PORT || 3014;

    // Initialize Kafka
    const kafka = new Kafka({
      clientId: 'caas-kafka-service',
      brokers: [env.KAFKA_BROKER || 'localhost:9092'],
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    // Initialize event registry
    const eventRegistry = new EventRegistry();

    // Initialize producer and consumer
    const producer = new EventProducer(kafka, logger);
    const consumer = new EventConsumer(kafka, eventRegistry, logger);

    // Start consumer
    await consumer.start();

    // Middleware
    app.use(helmet());
    app.use(cors({
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging middleware
    app.use(pinoHttp({ logger }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        service: 'kafka-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        kafka: {
          connected: producer.isConnected(),
          topics: eventRegistry.getTopics()
        }
      });
    });

    // API routes
    app.use('/api/v1/kafka', createKafkaRoutes(producer, eventRegistry));

    // Error handling
    app.use(errorHandler);
    app.use(notFoundHandler);

    // Start server
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Kafka service started');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await consumer.stop();
      await producer.disconnect();
      process.exit(0);
    });

  } catch (error) {
    logger.error(error, 'Failed to start Kafka service');
    process.exit(1);
  }
}

startServer();
