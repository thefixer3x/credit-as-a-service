import type { Config } from 'drizzle-kit';
import { validateEnv } from '@caas/config';

const env = validateEnv();

export default {
  schema: './src/schema/*',
  out: './migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} satisfies Config;