import { z } from 'zod';

export const eventIdSchema = z.string().min(1);
export const eventTypeSchema = z.string().min(1);
export const eventSourceSchema = z.string().min(1);
export const eventTimestampSchema = z.number().int().nonnegative();
export const eventVersionSchema = z.string().min(1);

export const eventEnvelopeSchema = z.object({
  id: eventIdSchema,
  type: eventTypeSchema,
  source: eventSourceSchema,
  timestamp: eventTimestampSchema,
  version: eventVersionSchema,
  correlationId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional(),
  aggregateType: z.string().min(1).optional(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
});

export type EventEnvelope<T = Record<string, any>> =
  Omit<z.infer<typeof eventEnvelopeSchema>, 'data'> & { data: T };
