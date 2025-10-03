import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { ApolloServer } from '@apollo/server';
import { fastifyApollo } from '@fastify/apollo';
import pino from 'pino';

import { validateEnv } from '@caas/config';
import { errorHandler, notFoundHandler } from '@caas/common';
import { typeDefs } from './schema/typeDefs.js';
import { resolvers } from './resolvers/index.js';
import { context } from './context/index.js';

const logger = pino({ name: 'graphql-gateway' });
const env = validateEnv();

async function startServer() {
  try {
    const app = fastify({
      logger: logger,
      trustProxy: true,
    });

    const PORT = env.GRAPHQL_SERVICE_PORT || 3009;

    // Create Apollo Server
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      plugins: [
        // Add Apollo Studio landing page in development
        process.env.NODE_ENV === 'development' 
          ? require('@apollo/server-plugin-landing-page-local-default').default()
          : undefined
      ].filter(Boolean),
      introspection: process.env.NODE_ENV === 'development',
    });

    // Start Apollo Server
    await apolloServer.start();

    // Register plugins
    await app.register(cors, {
      origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    });

    await app.register(helmet);

    // Register Apollo GraphQL
    await app.register(fastifyApollo(apolloServer), {
      context,
      path: '/graphql',
    });

    // Health check endpoint
    app.get('/health', async (request, reply) => {
      return {
        service: 'graphql-gateway',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        graphqlEndpoint: '/graphql',
      };
    });

    // GraphQL Playground endpoint (development only)
    if (process.env.NODE_ENV === 'development') {
      app.get('/playground', async (request, reply) => {
        return reply.redirect('/graphql');
      });
    }

    // Error handling
    app.setErrorHandler(errorHandler);
    app.setNotFoundHandler(notFoundHandler);

    // Start server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ 
      port: PORT, 
      graphqlEndpoint: `http://localhost:${PORT}/graphql`,
      playground: process.env.NODE_ENV === 'development' ? `http://localhost:${PORT}/playground` : 'disabled'
    }, 'GraphQL Gateway started');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await apolloServer.stop();
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await apolloServer.stop();
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start GraphQL Gateway:', error);
    process.exit(1);
  }
}

startServer();
