import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { server } from '../mocks/server';
import { closeTestDatabase, resetDatabase, initializeTestDatabase } from '../utils/database';
import { clearRedisCache, closeTestRedis } from '../utils/redis';

const setEnvDefault = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

const isUnitRun =
  process.env.TEST_SUITE === 'unit' || process.argv.some((arg) => arg.includes('unit'));
const shouldInitDb = !isUnitRun && process.env.TEST_SKIP_DB !== 'true';

// Ensure required env vars exist before any service imports run.
setEnvDefault('NODE_ENV', 'test');
setEnvDefault('JWT_SECRET', 'test-jwt-secret-key-for-testing-only-123456');
setEnvDefault('DATABASE_URL', 'postgresql://test:test@localhost:5433/caas_test');
setEnvDefault('REDIS_URL', 'redis://localhost:6380');
setEnvDefault('REDIS_HOST', 'localhost');
setEnvDefault('REDIS_PORT', '6380');
setEnvDefault('SME_API_BASE_URL', 'http://localhost:9001');
setEnvDefault('SME_API_KEY', 'test-sme-api-key');
setEnvDefault('SME_WEBHOOK_SECRET', 'test-sme-webhook-secret');
setEnvDefault('LOG_LEVEL', 'silent');

// Global test setup
beforeAll(async () => {
  // Setup MSW server for mocking external APIs
  server.listen({ onUnhandledRequest: 'error' });
  
  // Initialize test database
  if (shouldInitDb) {
    await initializeTestDatabase();
  }
});

// Reset between tests
beforeEach(async () => {
  // Reset MSW handlers
  server.resetHandlers();
  
  // Reset database state
  if (shouldInitDb) {
    await resetDatabase();
  }
  
  // Clear Redis cache
  await clearRedisCache();
});

// Cleanup after each test
afterEach(() => {
  // Clear any timers or intervals
  vi.clearAllTimers();
  
  // Clear all mocks
  vi.clearAllMocks();
});

// Global teardown
afterAll(async () => {
  // Close MSW server
  server.close();
  
  // Close database connections
  if (shouldInitDb) {
    await closeTestDatabase();
  }
  
  // Close Redis connection
  await closeTestRedis();
});

// Global test utilities
declare global {
  var testDbConnection: any;
  var testRedisClient: any;
}
