import { createClient } from 'redis';
import { testConfig } from '../setup/test-env';

let testRedisClient: ReturnType<typeof createClient>;

export async function initializeTestRedis() {
  try {
    testRedisClient = createClient({
      url: testConfig.redis.url,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true,
      },
    });

    testRedisClient.on('error', (err) => {
      console.error('Test Redis Client Error:', err);
    });

    await testRedisClient.connect();
    global.testRedisClient = testRedisClient;
  } catch (error) {
    console.error('Failed to initialize test Redis:', error);
    throw error;
  }
}

export async function clearRedisCache() {
  if (!testRedisClient) {
    return;
  }

  try {
    await testRedisClient.flushDb();
  } catch (error) {
    console.error('Failed to clear Redis cache:', error);
    throw error;
  }
}

export async function closeTestRedis() {
  if (testRedisClient) {
    await testRedisClient.quit();
  }
}

export function getTestRedisClient() {
  if (!testRedisClient) {
    throw new Error('Test Redis client not initialized');
  }
  return testRedisClient;
}

// Helper functions for Redis testing
export async function setTestCache(key: string, value: any, ttl?: number) {
  const client = getTestRedisClient();
  const serialized = JSON.stringify(value);
  
  if (ttl) {
    await client.setEx(key, ttl, serialized);
  } else {
    await client.set(key, serialized);
  }
}

export async function getTestCache(key: string) {
  const client = getTestRedisClient();
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
}

export async function deleteTestCache(key: string) {
  const client = getTestRedisClient();
  await client.del(key);
}

export async function existsTestCache(key: string): Promise<boolean> {
  const client = getTestRedisClient();
  const exists = await client.exists(key);
  return exists === 1;
}