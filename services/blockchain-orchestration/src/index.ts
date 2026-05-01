import fastify from 'fastify';
import pino from 'pino';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({ name: 'blockchain-orchestration' });

const OperationSchema = z.object({
  type: z.enum(['collateral_lock', 'collateral_release', 'credit_score_anchor', 'disbursement_anchor']),
  chainId: z.number().int().positive().default(31337),
  referenceId: z.string().min(1),
  walletAddress: z.string().min(10).optional(),
  amount: z.number().nonnegative().optional(),
  metadata: z.record(z.any()).default({}),
});

type Operation = z.infer<typeof OperationSchema> & {
  id: string;
  status: 'queued' | 'submitted' | 'confirmed' | 'failed';
  txHash?: string;
  createdAt: string;
  updatedAt: string;
};

const operations = new Map<string, Operation>();

export const name = 'blockchain-orchestration';

export async function buildServer() {
  const server = fastify({ logger: false, trustProxy: true });

  server.get('/health', async () => ({
    status: 'healthy',
    service: name,
    operationCount: operations.size,
    timestamp: new Date().toISOString(),
  }));

  server.get('/metrics', async () => {
    const byStatus = [...operations.values()].reduce<Record<string, number>>((acc, operation) => {
      acc[operation.status] = (acc[operation.status] ?? 0) + 1;
      return acc;
    }, {});

    return { totalOperations: operations.size, byStatus };
  });

  server.post('/operations', async (request, reply) => {
    const input = OperationSchema.parse(request.body);
    const now = new Date().toISOString();
    const operation: Operation = {
      ...input,
      id: `chainop_${uuidv4()}`,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    operations.set(operation.id, operation);
    logger.info({ operationId: operation.id, type: operation.type }, 'Blockchain operation queued');

    return reply.code(202).send({ success: true, data: operation });
  });

  server.post('/operations/:operationId/submit', async (request, reply) => {
    const { operationId } = request.params as { operationId: string };
    const operation = operations.get(operationId);

    if (!operation) {
      return reply.code(404).send({ success: false, error: 'Operation not found' });
    }

    const updated: Operation = {
      ...operation,
      status: 'submitted',
      txHash: `0x${Buffer.from(operation.id).toString('hex').slice(0, 64).padEnd(64, '0')}`,
      updatedAt: new Date().toISOString(),
    };

    operations.set(operationId, updated);
    return { success: true, data: updated };
  });

  server.get('/operations/:operationId', async (request, reply) => {
    const { operationId } = request.params as { operationId: string };
    const operation = operations.get(operationId);

    if (!operation) {
      return reply.code(404).send({ success: false, error: 'Operation not found' });
    }

    return { success: true, data: operation };
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ success: false, error: 'Invalid request data', details: error.errors });
    }

    logger.error({ error, url: request.url }, 'Blockchain orchestration error');
    return reply.code(error.statusCode ?? 500).send({ success: false, error: error.message });
  });

  return server;
}

export async function startServer() {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? 3012);
  const host = process.env.HOST ?? '0.0.0.0';
  await server.listen({ port, host });
  logger.info({ host, port }, 'Blockchain orchestration service started');
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    logger.error({ error }, 'Failed to start blockchain orchestration service');
    process.exit(1);
  });
}
