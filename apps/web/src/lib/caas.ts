import { CaasSDK } from '@caas/sdk';

if (!process.env.CAAS_API_KEY) {
  throw new Error('CAAS_API_KEY environment variable is required');
}

if (!process.env.CAAS_ENVIRONMENT) {
  throw new Error('CAAS_ENVIRONMENT environment variable is required');
}

// Initialize the CAAS SDK
export const caas = new CaasSDK({
  apiKey: process.env.CAAS_API_KEY,
  environment: process.env.CAAS_ENVIRONMENT as 'development' | 'staging' | 'production',
  baseUrl: process.env.CAAS_API_URL,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  rateLimitPerHour: 5000, // Higher limit for web dashboard
});

// Event listeners for monitoring
if (process.env.NODE_ENV === 'development') {
  caas.on('request:start', (data) => {
    console.log(`🚀 API Request: ${data.method} ${data.url}`);
  });

  caas.on('request:success', (data) => {
    console.log(`✅ API Success: ${data.method} ${data.url} (${data.duration}ms)`);
  });

  caas.on('request:error', (data) => {
    console.error(`❌ API Error: ${data.method} ${data.url}`, data.error);
  });

  caas.on('auth:expired', () => {
    console.warn('🔑 API key expired, please check authentication');
  });

  caas.on('rate:limit', (data) => {
    console.warn(`⏰ Rate limited, resets at ${new Date(data.resetTime)}`);
  });
}

export default caas;