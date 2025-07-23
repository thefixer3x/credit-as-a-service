/**
 * Comprehensive Redis Cache Configuration for Credit-as-a-Service Platform
 * 
 * This file contains all configuration options for the caching layer,
 * including Redis connection settings, cache policies, and service-specific configs.
 */

export interface EnvironmentConfig {
  // Redis Connection
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD?: string;
  REDIS_DB: string;
  REDIS_KEY_PREFIX: string;
  
  // Redis Cluster Configuration
  REDIS_CLUSTER_ENABLED: string;
  REDIS_CLUSTER_NODES?: string; // JSON array of {host, port} objects
  
  // Redis Security
  REDIS_TLS_ENABLED: string;
  REDIS_TLS_CERT?: string;
  REDIS_TLS_KEY?: string;
  REDIS_TLS_CA?: string;
  REDIS_AUTH_USER?: string;
  
  // Redis Performance
  REDIS_POOL_SIZE: string;
  REDIS_MAX_MEMORY_POLICY: string;
  REDIS_CONNECT_TIMEOUT: string;
  REDIS_COMMAND_TIMEOUT: string;
  REDIS_RETRY_ATTEMPTS: string;
  REDIS_RETRY_DELAY: string;
  
  // Cache Policies
  CACHE_DEFAULT_TTL: string;
  CACHE_MAX_SIZE: string;
  CACHE_COMPRESSION_ENABLED: string;
  
  // Session Configuration
  SESSION_TTL_SECONDS: string;
  SESSION_MAX_PER_USER: string;
  SESSION_EXTEND_ON_ACCESS: string;
  SESSION_COOKIE_NAME: string;
  SESSION_COOKIE_SECURE: string;
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: string;
  RATE_LIMIT_DEFAULT_WINDOW: string;
  RATE_LIMIT_DEFAULT_MAX: string;
  RATE_LIMIT_BLOCK_DURATION: string;
  RATE_LIMIT_ENABLE_BLOCKING: string;
  
  // API Caching
  API_CACHE_ENABLED: string;
  API_CACHE_DEFAULT_TTL: string;
  API_CACHE_MAX_SIZE: string;
  API_CACHE_COMPRESSION: string;
  
  // Credit Caching
  CREDIT_SCORE_TTL: string;
  CREDIT_APPLICATION_TTL: string;
  CREDIT_LIMIT_TTL: string;
  CREDIT_RISK_TTL: string;
  
  // Monitoring
  MONITORING_ENABLED: string;
  MONITORING_INTERVAL: string;
  MONITORING_RETENTION_HOURS: string;
  MONITORING_ALERT_ENABLED: string;
  
  // Cache Invalidation
  INVALIDATION_ENABLED: string;
  INVALIDATION_CHANNEL: string;
  INVALIDATION_BATCH_SIZE: string;
  
  // Environment
  NODE_ENV: string;
  LOG_LEVEL: string;
}

/**
 * Default configuration values
 */
export const defaultConfig: Record<keyof EnvironmentConfig, string> = {
  // Redis Connection
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: '',
  REDIS_DB: '0',
  REDIS_KEY_PREFIX: 'caas:',
  
  // Redis Cluster
  REDIS_CLUSTER_ENABLED: 'false',
  REDIS_CLUSTER_NODES: '',
  
  // Redis Security
  REDIS_TLS_ENABLED: 'false',
  REDIS_TLS_CERT: '',
  REDIS_TLS_KEY: '',
  REDIS_TLS_CA: '',
  REDIS_AUTH_USER: '',
  
  // Redis Performance
  REDIS_POOL_SIZE: '10',
  REDIS_MAX_MEMORY_POLICY: 'allkeys-lru',
  REDIS_CONNECT_TIMEOUT: '10000',
  REDIS_COMMAND_TIMEOUT: '5000',
  REDIS_RETRY_ATTEMPTS: '3',
  REDIS_RETRY_DELAY: '100',
  
  // Cache Policies
  CACHE_DEFAULT_TTL: '300', // 5 minutes
  CACHE_MAX_SIZE: '1048576', // 1MB
  CACHE_COMPRESSION_ENABLED: 'true',
  
  // Session Configuration
  SESSION_TTL_SECONDS: '86400', // 24 hours
  SESSION_MAX_PER_USER: '5',
  SESSION_EXTEND_ON_ACCESS: 'true',
  SESSION_COOKIE_NAME: 'caas_session',
  SESSION_COOKIE_SECURE: 'true',
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: 'true',
  RATE_LIMIT_DEFAULT_WINDOW: '60', // 1 minute
  RATE_LIMIT_DEFAULT_MAX: '100',
  RATE_LIMIT_BLOCK_DURATION: '300', // 5 minutes
  RATE_LIMIT_ENABLE_BLOCKING: 'true',
  
  // API Caching
  API_CACHE_ENABLED: 'true',
  API_CACHE_DEFAULT_TTL: '300', // 5 minutes
  API_CACHE_MAX_SIZE: '1048576', // 1MB
  API_CACHE_COMPRESSION: 'true',
  
  // Credit Caching
  CREDIT_SCORE_TTL: '43200', // 12 hours
  CREDIT_APPLICATION_TTL: '86400', // 24 hours
  CREDIT_LIMIT_TTL: '1800', // 30 minutes
  CREDIT_RISK_TTL: '21600', // 6 hours
  
  // Monitoring
  MONITORING_ENABLED: 'true',
  MONITORING_INTERVAL: '30000', // 30 seconds
  MONITORING_RETENTION_HOURS: '24',
  MONITORING_ALERT_ENABLED: 'true',
  
  // Cache Invalidation
  INVALIDATION_ENABLED: 'true',
  INVALIDATION_CHANNEL: 'cache:invalidation',
  INVALIDATION_BATCH_SIZE: '1000',
  
  // Environment
  NODE_ENV: 'development',
  LOG_LEVEL: 'info'
};

/**
 * Production configuration overrides
 */
export const productionConfig: Partial<Record<keyof EnvironmentConfig, string>> = {
  // Redis Security - Always enable in production
  REDIS_TLS_ENABLED: 'true',
  SESSION_COOKIE_SECURE: 'true',
  
  // Performance optimizations
  REDIS_POOL_SIZE: '20',
  CACHE_COMPRESSION_ENABLED: 'true',
  
  // Stricter rate limiting
  RATE_LIMIT_DEFAULT_MAX: '500',
  RATE_LIMIT_BLOCK_DURATION: '600', // 10 minutes
  
  // Extended cache TTLs for production
  API_CACHE_DEFAULT_TTL: '600', // 10 minutes
  CREDIT_SCORE_TTL: '21600', // 6 hours (more frequent updates needed)
  
  // Enhanced monitoring
  MONITORING_INTERVAL: '15000', // 15 seconds
  MONITORING_RETENTION_HOURS: '72', // 3 days
  
  // Environment
  NODE_ENV: 'production',
  LOG_LEVEL: 'warn'
};

/**
 * Development configuration overrides
 */
export const developmentConfig: Partial<Record<keyof EnvironmentConfig, string>> = {
  // Relaxed security for development
  REDIS_TLS_ENABLED: 'false',
  SESSION_COOKIE_SECURE: 'false',
  
  // More verbose logging
  LOG_LEVEL: 'debug',
  
  // Shorter TTLs for faster testing
  CACHE_DEFAULT_TTL: '60', // 1 minute
  API_CACHE_DEFAULT_TTL: '120', // 2 minutes
  CREDIT_SCORE_TTL: '300', // 5 minutes
  
  // Relaxed rate limiting
  RATE_LIMIT_DEFAULT_MAX: '1000',
  RATE_LIMIT_BLOCK_DURATION: '60', // 1 minute
  
  // Monitoring
  MONITORING_INTERVAL: '60000', // 1 minute
  MONITORING_RETENTION_HOURS: '6'
};

/**
 * Test configuration overrides
 */
export const testConfig: Partial<Record<keyof EnvironmentConfig, string>> = {
  // Use different database for tests
  REDIS_DB: '15',
  REDIS_KEY_PREFIX: 'test:caas:',
  
  // Disable external dependencies
  MONITORING_ENABLED: 'false',
  INVALIDATION_ENABLED: 'false',
  
  // Very short TTLs for fast tests
  CACHE_DEFAULT_TTL: '5',
  SESSION_TTL_SECONDS: '30',
  CREDIT_SCORE_TTL: '10',
  
  // Minimal rate limiting
  RATE_LIMIT_DEFAULT_MAX: '10000',
  RATE_LIMIT_ENABLE_BLOCKING: 'false',
  
  // Test environment
  NODE_ENV: 'test',
  LOG_LEVEL: 'error' // Suppress logs in tests
};

/**
 * Load configuration based on environment
 */
export function loadCacheConfig(): EnvironmentConfig {
  const env = process.env.NODE_ENV || 'development';
  
  // Start with defaults
  let config = { ...defaultConfig };
  
  // Apply environment-specific overrides
  switch (env) {
    case 'production':
      config = { ...config, ...productionConfig };
      break;
    case 'development':
      config = { ...config, ...developmentConfig };
      break;
    case 'test':
      config = { ...config, ...testConfig };
      break;
  }
  
  // Override with actual environment variables
  Object.keys(config).forEach(key => {
    const envValue = process.env[key];
    if (envValue !== undefined) {
      config[key as keyof EnvironmentConfig] = envValue;
    }
  });
  
  return config as EnvironmentConfig;
}

/**
 * Validate configuration
 */
export function validateCacheConfig(config: EnvironmentConfig): string[] {
  const errors: string[] = [];
  
  // Required fields
  if (!config.REDIS_HOST) {
    errors.push('REDIS_HOST is required');
  }
  
  if (!config.REDIS_PORT || isNaN(Number(config.REDIS_PORT))) {
    errors.push('REDIS_PORT must be a valid number');
  }
  
  // Validate cluster configuration
  if (config.REDIS_CLUSTER_ENABLED === 'true' && !config.REDIS_CLUSTER_NODES) {
    errors.push('REDIS_CLUSTER_NODES is required when cluster is enabled');
  }
  
  if (config.REDIS_CLUSTER_NODES) {
    try {
      const nodes = JSON.parse(config.REDIS_CLUSTER_NODES);
      if (!Array.isArray(nodes) || nodes.length === 0) {
        errors.push('REDIS_CLUSTER_NODES must be a non-empty array');
      }
    } catch (e) {
      errors.push('REDIS_CLUSTER_NODES must be valid JSON');
    }
  }
  
  // Validate TLS configuration
  if (config.REDIS_TLS_ENABLED === 'true') {
    if (config.NODE_ENV === 'production' && !config.REDIS_TLS_CERT) {
      errors.push('REDIS_TLS_CERT is recommended in production when TLS is enabled');
    }
  }
  
  // Validate numeric values
  const numericFields = [
    'REDIS_DB', 'REDIS_POOL_SIZE', 'REDIS_CONNECT_TIMEOUT', 'REDIS_COMMAND_TIMEOUT',
    'REDIS_RETRY_ATTEMPTS', 'REDIS_RETRY_DELAY', 'CACHE_DEFAULT_TTL', 'CACHE_MAX_SIZE',
    'SESSION_TTL_SECONDS', 'SESSION_MAX_PER_USER', 'RATE_LIMIT_DEFAULT_WINDOW',
    'RATE_LIMIT_DEFAULT_MAX', 'RATE_LIMIT_BLOCK_DURATION', 'API_CACHE_DEFAULT_TTL',
    'API_CACHE_MAX_SIZE', 'CREDIT_SCORE_TTL', 'CREDIT_APPLICATION_TTL',
    'CREDIT_LIMIT_TTL', 'CREDIT_RISK_TTL', 'MONITORING_INTERVAL',
    'MONITORING_RETENTION_HOURS', 'INVALIDATION_BATCH_SIZE'
  ];
  
  numericFields.forEach(field => {
    const value = config[field as keyof EnvironmentConfig];
    if (value && isNaN(Number(value))) {
      errors.push(`${field} must be a valid number`);
    }
  });
  
  // Validate boolean values
  const booleanFields = [
    'REDIS_CLUSTER_ENABLED', 'REDIS_TLS_ENABLED', 'CACHE_COMPRESSION_ENABLED',
    'SESSION_EXTEND_ON_ACCESS', 'SESSION_COOKIE_SECURE', 'RATE_LIMIT_ENABLED',
    'RATE_LIMIT_ENABLE_BLOCKING', 'API_CACHE_ENABLED', 'API_CACHE_COMPRESSION',
    'MONITORING_ENABLED', 'MONITORING_ALERT_ENABLED', 'INVALIDATION_ENABLED'
  ];
  
  booleanFields.forEach(field => {
    const value = config[field as keyof EnvironmentConfig];
    if (value && !['true', 'false'].includes(value.toLowerCase())) {
      errors.push(`${field} must be 'true' or 'false'`);
    }
  });
  
  // Validate log level
  const validLogLevels = ['error', 'warn', 'info', 'debug', 'trace'];
  if (!validLogLevels.includes(config.LOG_LEVEL.toLowerCase())) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
  
  // Validate NODE_ENV
  const validEnvironments = ['development', 'production', 'test', 'staging'];
  if (!validEnvironments.includes(config.NODE_ENV.toLowerCase())) {
    errors.push(`NODE_ENV must be one of: ${validEnvironments.join(', ')}`);
  }
  
  return errors;
}

/**
 * Get service-specific configuration
 */
export function getServiceConfigs(config: EnvironmentConfig) {
  return {
    redis: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
      keyPrefix: config.REDIS_KEY_PREFIX,
      maxRetriesPerRequest: parseInt(config.REDIS_RETRY_ATTEMPTS, 10),
      retryDelayOnFailover: parseInt(config.REDIS_RETRY_DELAY, 10),
      connectTimeout: parseInt(config.REDIS_CONNECT_TIMEOUT, 10),
      commandTimeout: parseInt(config.REDIS_COMMAND_TIMEOUT, 10),
      lazyConnect: true,
      enableAutoPipelining: true,
      enableCluster: config.REDIS_CLUSTER_ENABLED === 'true',
      clusterNodes: config.REDIS_CLUSTER_NODES ? 
        JSON.parse(config.REDIS_CLUSTER_NODES) : undefined,
      enableTLS: config.REDIS_TLS_ENABLED === 'true',
      tlsCert: config.REDIS_TLS_CERT || undefined,
      tlsKey: config.REDIS_TLS_KEY || undefined,
      tlsCa: config.REDIS_TLS_CA || undefined,
      maxMemoryPolicy: config.REDIS_MAX_MEMORY_POLICY,
      enableOfflineQueue: true,
      keepAlive: 1,
      connectionPoolSize: parseInt(config.REDIS_POOL_SIZE, 10)
    },
    
    session: {
      ttlSeconds: parseInt(config.SESSION_TTL_SECONDS, 10),
      extendOnAccess: config.SESSION_EXTEND_ON_ACCESS === 'true',
      maxSessions: parseInt(config.SESSION_MAX_PER_USER, 10),
      sessionKeyPrefix: 'session:',
      userSessionsPrefix: 'user_sessions:'
    },
    
    rateLimit: {
      keyPrefix: 'rate_limit:',
      defaultWindowSize: parseInt(config.RATE_LIMIT_DEFAULT_WINDOW, 10),
      defaultMaxRequests: parseInt(config.RATE_LIMIT_DEFAULT_MAX, 10),
      defaultBlockDuration: parseInt(config.RATE_LIMIT_BLOCK_DURATION, 10),
      enableBlocking: config.RATE_LIMIT_ENABLE_BLOCKING === 'true'
    },
    
    apiCache: {
      keyPrefix: 'api_cache:',
      defaultTTL: parseInt(config.API_CACHE_DEFAULT_TTL, 10),
      maxCacheSize: parseInt(config.API_CACHE_MAX_SIZE, 10),
      enableCompression: config.API_CACHE_COMPRESSION === 'true',
      varyHeaders: ['accept', 'accept-encoding', 'authorization'],
      skipCacheHeaders: ['cache-control', 'pragma', 'expires']
    },
    
    credit: {
      creditScoreTTL: parseInt(config.CREDIT_SCORE_TTL, 10),
      creditApplicationTTL: parseInt(config.CREDIT_APPLICATION_TTL, 10),
      creditLimitTTL: parseInt(config.CREDIT_LIMIT_TTL, 10),
      riskAssessmentTTL: parseInt(config.CREDIT_RISK_TTL, 10)
    },
    
    monitoring: {
      enabled: config.MONITORING_ENABLED === 'true',
      interval: parseInt(config.MONITORING_INTERVAL, 10),
      retentionHours: parseInt(config.MONITORING_RETENTION_HOURS, 10),
      alertEnabled: config.MONITORING_ALERT_ENABLED === 'true'
    },
    
    invalidation: {
      enabled: config.INVALIDATION_ENABLED === 'true',
      channel: config.INVALIDATION_CHANNEL,
      batchSize: parseInt(config.INVALIDATION_BATCH_SIZE, 10)
    }
  };
}

/**
 * Configuration validation and loading utility
 */
export function initializeCacheConfig() {
  const config = loadCacheConfig();
  const errors = validateCacheConfig(config);
  
  if (errors.length > 0) {
    console.error('Cache configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid cache configuration');
  }
  
  const serviceConfigs = getServiceConfigs(config);
  
  console.log('Cache configuration loaded:', {
    environment: config.NODE_ENV,
    redis: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      cluster: config.REDIS_CLUSTER_ENABLED === 'true',
      tls: config.REDIS_TLS_ENABLED === 'true'
    },
    features: {
      monitoring: serviceConfigs.monitoring.enabled,
      invalidation: serviceConfigs.invalidation.enabled,
      rateLimit: config.RATE_LIMIT_ENABLED === 'true',
      apiCache: config.API_CACHE_ENABLED === 'true'
    }
  });
  
  return serviceConfigs;
}

// Export types for external use
export type CacheConfigServices = ReturnType<typeof getServiceConfigs>;