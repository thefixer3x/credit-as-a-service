import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ name: 'provider-service' });

const ProviderSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['bank', 'fintech', 'microfinance', 'nbfi', 'cooperative', 'other']),
  webhookUrl: z.string().url().optional(),
  apiBaseUrl: z.string().url().optional(),
  supportedCurrencies: z.array(z.string().length(3)).default(['NGN']),
  serviceRegions: z.array(z.string()).default(['NG']),
  minLoanAmount: z.number().nonnegative().default(0),
  maxLoanAmount: z.number().positive(),
  contactEmail: z.string().email(),
});

type Provider = z.infer<typeof ProviderSchema> & {
  id: string;
  status: 'pending' | 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
};

const providers = new Map<string, Provider>();

export const name = 'provider-service';

export async function buildServer() {
  const server = fastify({ logger: false, trustProxy: true });

  await server.register(cors, { origin: true, credentials: true });
  await server.register(helmet);
  await server.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'CAAS Provider Service',
        description: 'Credit provider catalog and activation service',
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
    providerCount: providers.size,
    timestamp: new Date().toISOString(),
  }));

  server.get('/metrics', async () => {
    const byStatus = [...providers.values()].reduce<Record<string, number>>((acc, provider) => {
      acc[provider.status] = (acc[provider.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalProviders: providers.size,
      byStatus,
      timestamp: new Date().toISOString(),
    };
  });

  server.post('/providers', async (request, reply) => {
    const input = ProviderSchema.parse(request.body);
    const now = new Date().toISOString();
    const provider: Provider = {
      ...input,
      id: `provider_${uuidv4()}`,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    providers.set(provider.id, provider);
    logger.info({ providerId: provider.id }, 'Provider registered');

    return reply.code(201).send({ success: true, data: provider });
  });

  server.get('/providers', async request => {
    const query = request.query as { status?: Provider['status']; limit?: string; offset?: string };
    const offset = Number(query.offset ?? 0);
    const limit = Number(query.limit ?? 50);
    const filtered = [...providers.values()].filter(provider =>
      query.status ? provider.status === query.status : true
    );

    return {
      success: true,
      data: filtered.slice(offset, offset + limit),
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    };
  });

  server.get('/providers/:providerId', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = providers.get(providerId);

    if (!provider) {
      return reply.code(404).send({ success: false, error: 'Provider not found' });
    }

    return { success: true, data: provider };
  });

  server.patch('/providers/:providerId/status', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const body = z.object({
      status: z.enum(['pending', 'active', 'inactive', 'suspended']),
      reason: z.string().optional(),
    }).parse(request.body);
    const provider = providers.get(providerId);

    if (!provider) {
      return reply.code(404).send({ success: false, error: 'Provider not found' });
    }

    const updated = {
      ...provider,
      status: body.status,
      updatedAt: new Date().toISOString(),
    };
    providers.set(providerId, updated);

    logger.info({ providerId, status: body.status, reason: body.reason }, 'Provider status updated');
    return { success: true, data: updated };
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ success: false, error: 'Invalid request data', details: error.errors });
    }

    logger.error({ error, url: request.url }, 'Provider service error');
    return reply.code(error.statusCode ?? 500).send({ success: false, error: error.message });
  });

  return server;
}

export async function startServer() {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? 3010);
  const host = process.env.HOST ?? '0.0.0.0';
  await server.listen({ port, host });
  logger.info({ host, port }, 'Provider service started');
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    logger.error({ error }, 'Failed to start provider service');
    process.exit(1);
  });
}
