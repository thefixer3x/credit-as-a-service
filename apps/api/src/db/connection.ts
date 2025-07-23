import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { logger } from '../utils/logger';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/caas_platform';

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { 
  prepare: false,
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export async function testConnection() {
  try {
    await client`SELECT 1`;
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

export async function closeConnection() {
  try {
    await client.end();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
}

// Export types
export type Database = typeof db;
export * from './schema';