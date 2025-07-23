import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import pino from 'pino';

import { UnderwritingEngine } from './services/underwriting-engine.js';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'underwriting-service' });
const env = validateEnv();

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL || 'info',
      transport: env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: { colorize: true }
      } : undefined
    }
  });

  const underwritingEngine = new UnderwritingEngine();

  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true
  });

  // Credit assessment endpoint
  fastify.post('/applications/:applicationId/assess', {
    schema: {
      params: {
        type: 'object',
        properties: {
          applicationId: { type: 'string', format: 'uuid' }
        },
        required: ['applicationId']
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          requestedAmount: { type: 'number', minimum: 1000 },
          currency: { type: 'string', enum: ['NGN', 'USD', 'GHS', 'KES'] },
          purpose: { type: 'string', minLength: 1 },
          organizationId: { type: 'string', format: 'uuid' }
        },
        required: ['userId', 'requestedAmount', 'currency', 'purpose']
      }
    }
  }, async (request, reply) => {
    try {
      const { applicationId } = request.params as { applicationId: string };
      const assessmentRequest = {
        applicationId,
        ...(request.body as any)
      };

      const result = await underwritingEngine.assessCreditApplication(assessmentRequest);
      
      return reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ error }, 'Credit assessment failed');
      return reply.status(500).send({
        success: false,
        error: 'Credit assessment failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: 'underwriting-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();
    const port = parseInt(env.PORT?.toString() || '8002', 10);
    const host = env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    logger.info({ port, host }, 'Underwriting service started');

  } catch (error) {
    logger.error({ error }, 'Failed to start underwriting service');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };