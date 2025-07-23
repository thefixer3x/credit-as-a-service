import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { server } from '../mocks/server';
import { resetDatabase, initializeTestDatabase } from '../utils/database';
import { clearRedisCache } from '../utils/redis';

// Global test setup
beforeAll(async () => {
  // Setup MSW server for mocking external APIs
  server.listen({ onUnhandledRequest: 'error' });
  
  // Initialize test database
  await initializeTestDatabase();
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/caas_test';
  process.env.REDIS_URL = 'redis://localhost:6380';
  process.env.LOG_LEVEL = 'silent';
});

// Reset between tests
beforeEach(async () => {
  // Reset MSW handlers
  server.resetHandlers();
  
  // Reset database state
  await resetDatabase();
  
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
  await global.testDbConnection?.close();
  
  // Close Redis connection
  await global.testRedisClient?.quit();
});

// Global test utilities
declare global {
  var testDbConnection: any;
  var testRedisClient: any;
}