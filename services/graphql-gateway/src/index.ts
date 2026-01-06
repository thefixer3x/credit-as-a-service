import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { validateEnv } from '@caas/config';
import { errorHandler, notFoundHandler } from '@caas/common';
import { typeDefs } from './schema/typeDefs.js';
import { resolvers } from './resolvers/index.js';
import { context } from './context/index.js';

const logger = pino({ name: 'graphql-gateway' });
const env = validateEnv();

async function startServer() {
  try {
    const app = express();
    const PORT = env.GRAPHQL_SERVICE_PORT || 3009;

    // Create Apollo Server
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      introspection: process.env.NODE_ENV === 'development',
    });

    // Start Apollo Server
    await apolloServer.start();

    // Middleware
    app.use(helmet());
    app.use(cors({
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(pinoHttp({ logger }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        service: 'graphql-gateway',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        graphqlEndpoint: '/graphql',
      });
    });

    // GraphQL endpoint
    app.use('/graphql', expressMiddleware(apolloServer, {
      context,
    }));

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Start server
    app.listen(PORT, () => {
      logger.info({
        port: PORT,
        graphqlEndpoint: `http://localhost:${PORT}/graphql`,
      }, 'GraphQL Gateway started');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await apolloServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await apolloServer.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start GraphQL Gateway:', error);
    process.exit(1);
  }
}

startServer();
