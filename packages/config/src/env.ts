import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().optional(),
  REDIS_KEY_PREFIX: z.string().optional(),
  
  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Blockchain
  ETHEREUM_RPC_URL: z.string().url().optional(),
  PRIVATE_KEY: z.string().optional(),
  ETHERSCAN_API_KEY: z.string().optional(),
  
  // SME Integration
  SME_API_BASE_URL: z.string().url().default('https://api.sme.seftechub.com'),
  SME_API_KEY: z.string(),
  SME_WEBHOOK_SECRET: z.string(),
  
  // Third-party integrations
  PREMBLY_API_KEY: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  MONO_SECRET_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnv(): Environment {
  const parsed = environmentSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error('Environment validation failed:');
    console.error(parsed.error.format());
    process.exit(1);
  }
  
  return parsed.data;
}