import { z } from 'zod';

export const databaseConfigSchema = z.object({
  url: z.string().url(),
  ssl: z.boolean().default(true),
  pool: z.object({
    min: z.number().default(2),
    max: z.number().default(10),
    idleTimeoutMillis: z.number().default(30000),
    connectionTimeoutMillis: z.number().default(5000),
  }).default({}),
  migrations: z.object({
    directory: z.string().default('./migrations'),
    tableName: z.string().default('migrations'),
  }).default({}),
});

export const redisConfigSchema = z.object({
  url: z.string().url(),
  keyPrefix: z.string().default('caas:'),
  retryDelayOnFailover: z.number().default(100),
  maxRetriesPerRequest: z.number().default(3),
  lazyConnect: z.boolean().default(true),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type RedisConfig = z.infer<typeof redisConfigSchema>;