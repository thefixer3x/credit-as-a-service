import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables
config({ path: resolve(__dirname, '../.env.test') });

export const testConfig = {
  database: {
    url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5433/caas_test',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5433'),
    name: process.env.TEST_DB_NAME || 'caas_test',
    user: process.env.TEST_DB_USER || 'test',
    password: process.env.TEST_DB_PASSWORD || 'test',
  },
  redis: {
    url: process.env.TEST_REDIS_URL || 'redis://localhost:6380',
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6380'),
  },
  api: {
    port: parseInt(process.env.TEST_API_PORT || '8001'),
    baseUrl: process.env.TEST_API_BASE_URL || 'http://localhost:8001',
  },
  web: {
    port: parseInt(process.env.TEST_WEB_PORT || '3001'),
    baseUrl: process.env.TEST_WEB_BASE_URL || 'http://localhost:3001',
  },
  auth: {
    jwtSecret: process.env.TEST_JWT_SECRET || 'test-jwt-secret-key-for-testing-only',
    jwtExpiry: process.env.TEST_JWT_EXPIRY || '1h',
    refreshTokenExpiry: process.env.TEST_REFRESH_TOKEN_EXPIRY || '30d',
  },
  external: {
    smeApiUrl: process.env.TEST_SME_API_URL || 'http://localhost:9001',
    blockchainRpcUrl: process.env.TEST_BLOCKCHAIN_RPC_URL || 'http://localhost:8545',
    paymentGatewayUrl: process.env.TEST_PAYMENT_GATEWAY_URL || 'http://localhost:9002',
  },
  timeouts: {
    test: 10000,
    integration: 30000,
    e2e: 60000,
  },
  logging: {
    level: process.env.TEST_LOG_LEVEL || 'silent',
  },
};