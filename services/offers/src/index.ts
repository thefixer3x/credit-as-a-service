import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import pino from 'pino';

import { OffersEngine } from './services/offers-engine.js';
import { validateEnv } from '@caas/config';
import type { OfferRequest } from './types/offers.js';
import type { CreditAssessmentResult } from '@caas/types';

const logger = pino({ name: 'offers-service' });
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

  const offersEngine = new OffersEngine();

  await fastify.register(helmet);
  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true
  });

  // Generate offers endpoint
  fastify.post('/applications/:applicationId/offers', {
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
          requestedAmount: { type: 'number', minimum: 10000 },
          requestedTermMonths: { type: 'number', minimum: 1, maximum: 60 },
          currency: { type: 'string', enum: ['NGN', 'USD', 'GHS', 'KES'] },
          purpose: { type: 'string', minLength: 1 },
          urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
          riskAssessment: {
            type: 'object',
            properties: {
              riskScore: { type: 'number' },
              riskGrade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
              probabilityOfDefault: { type: 'number' },
              recommendation: { type: 'string' }
            },
            required: ['riskScore', 'riskGrade', 'probabilityOfDefault', 'recommendation']
          }
        },
        required: ['userId', 'requestedAmount', 'requestedTermMonths', 'currency', 'purpose', 'riskAssessment']
      }
    }
  }, async (request, reply) => {
    try {
      const { applicationId } = request.params as { applicationId: string };
      const { riskAssessment, ...offerRequestData } = request.body as any;

      const offerRequest: OfferRequest = {
        applicationId,
        ...offerRequestData
      };

      const riskAssessmentResult: CreditAssessmentResult = {
        assessmentId: 'temp-id',
        userId: offerRequest.userId,
        applicationId,
        modelVersion: '1.0.0',
        processedAt: new Date(),
        expiresAt: new Date(),
        riskFactors: [],
        positiveFactors: [],
        confidenceLevel: 0.8,
        ...riskAssessment
      };

      const comparison = await offersEngine.generateOffers(offerRequest, riskAssessmentResult);
      
      return reply.send({
        success: true,
        data: comparison,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ error }, 'Failed to generate offers');
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate offers',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Accept offer endpoint
  fastify.post('/offers/:offerId/accept', {
    schema: {
      params: {
        type: 'object',
        properties: {
          offerId: { type: 'string', format: 'uuid' }
        },
        required: ['offerId']
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' }
        },
        required: ['userId']
      }
    }
  }, async (request, reply) => {
    try {
      const { offerId } = request.params as { offerId: string };
      const { userId } = request.body as { userId: string };

      const result = await offersEngine.acceptOffer(userId, offerId);
      
      return reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ error }, 'Failed to accept offer');
      return reply.status(500).send({
        success: false,
        error: 'Failed to accept offer',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: 'offers-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();
    const port = parseInt(env.PORT?.toString() || '8003', 10);
    const host = env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    logger.info({ port, host }, 'Offers service started');

  } catch (error) {
    logger.error({ error }, 'Failed to start offers service');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };