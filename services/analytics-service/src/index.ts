import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ name: 'analytics-service' });

const EventSchema = z.object({
  type: z.string().min(1),
  source: z.string().min(1),
  actorId: z.string().optional(),
  entityId: z.string().optional(),
  amount: z.number().optional(),
  metadata: z.record(z.any()).default({}),
  occurredAt: z.string().datetime().optional(),
});

type AnalyticsEvent = z.infer<typeof EventSchema> & {
  id: string;
  receivedAt: string;
};

const events: AnalyticsEvent[] = [];

export const name = 'analytics-service';

export async function buildServer() {
  const server = fastify({ logger: false, trustProxy: true });

  await server.register(cors, { origin: true, credentials: true });
  await server.register(helmet);
  await server.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'CAAS Analytics Service',
        description: 'Operational analytics ingestion and reporting service',
        version: '1.0.0',
      },
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });
  await server.register(swaggerUi, { routePrefix: '/docs' });

  server.get('/health', async () => ({
    status: 'healthy',
    service: name,
    eventCount: events.length,
    timestamp: new Date().toISOString(),
  }));

  server.post('/events', async (request, reply) => {
    const input = EventSchema.parse(request.body);
    const event: AnalyticsEvent = {
      ...input,
      id: `evt_${uuidv4()}`,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };

    events.push(event);
    logger.info({ eventId: event.id, type: event.type, source: event.source }, 'Analytics event ingested');

    return reply.code(202).send({ success: true, data: event });
  });

  server.get('/metrics', async request => {
    const query = request.query as { source?: string; type?: string };
    const filtered = events.filter(event => {
      if (query.source && event.source !== query.source) return false;
      if (query.type && event.type !== query.type) return false;
      return true;
    });

    const byType = filtered.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});

    const totalAmount = filtered.reduce((sum, event) => sum + (event.amount ?? 0), 0);

    return {
      success: true,
      data: {
        totalEvents: filtered.length,
        byType,
        totalAmount,
        filters: query,
      },
    };
  });

  server.get('/reports/summary', async () => {
    const uniqueActors = new Set(events.map(event => event.actorId).filter(Boolean));
    const uniqueEntities = new Set(events.map(event => event.entityId).filter(Boolean));

    return {
      success: true,
      data: {
        totalEvents: events.length,
        uniqueActors: uniqueActors.size,
        uniqueEntities: uniqueEntities.size,
        latestEventAt: events.at(-1)?.receivedAt,
      },
    };
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ success: false, error: 'Invalid request data', details: error.errors });
    }

    logger.error({ error, url: request.url }, 'Analytics service error');
    return reply.code(error.statusCode ?? 500).send({ success: false, error: error.message });
  });

  return server;
}

export async function startServer() {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? 3011);
  const host = process.env.HOST ?? '0.0.0.0';
  await server.listen({ port, host });
  logger.info({ host, port }, 'Analytics service started');
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    logger.error({ error }, 'Failed to start analytics service');
    process.exit(1);
  });
}
