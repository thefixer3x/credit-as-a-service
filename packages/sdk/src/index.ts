import { HttpClient } from './core/http-client.js';
import { UserService } from './services/user.service.js';
import { CreditService } from './services/credit.service.js';
import { 
  SdkConfig, 
  SdkConfigSchema, 
  CaasError,
  CaasAuthError,
  CaasRateLimitError,
  CaasValidationError,
  SdkEvents
} from './types/index.js';
import EventEmitter from 'eventemitter3';

/**
 * Main SDK class for Credit-as-a-Service Platform
 * 
 * @example
 * ```typescript
 * import { CaasSDK } from '@caas/sdk';
 * 
 * const caas = new CaasSDK({
 *   apiKey: 'your-api-key',
 *   environment: 'production'
 * });
 * 
 * // Create a new user
 * const user = await caas.users.createUser({
 *   email: 'john@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe'
 * });
 * 
 * // Create a credit application
 * const application = await caas.credit.createApplication({
 *   userId: user.id,
 *   requestedAmount: 10000,
 *   purpose: 'Business expansion'
 * });
 * ```
 */
export class CaasSDK extends EventEmitter<SdkEvents> {
  private httpClient: HttpClient;
  
  public readonly users: UserService;
  public readonly credit: CreditService;

  constructor(config: SdkConfig) {
    super();

    // Validate configuration
    const validatedConfig = SdkConfigSchema.parse(config);
    
    // Initialize HTTP client
    this.httpClient = new HttpClient(validatedConfig);
    
    // Forward events from HTTP client
    this.httpClient.on('request:start', (data) => this.emit('request:start', data));
    this.httpClient.on('request:success', (data) => this.emit('request:success', data));
    this.httpClient.on('request:error', (data) => this.emit('request:error', data));
    this.httpClient.on('auth:expired', (data) => this.emit('auth:expired', data));
    this.httpClient.on('rate:limit', (data) => this.emit('rate:limit', data));
    
    // Initialize services
    this.users = new UserService(this.httpClient);
    this.credit = new CreditService(this.httpClient);
  }

  /**
   * Update SDK configuration
   */
  updateConfig(newConfig: Partial<SdkConfig>): void {
    const validatedConfig = SdkConfigSchema.partial().parse(newConfig);
    this.httpClient.updateConfig(validatedConfig);
  }

  /**
   * Get current SDK configuration
   */
  getConfig(): Readonly<SdkConfig> {
    return this.httpClient.getConfig();
  }

  /**
   * Perform health check on the API
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; timestamp: string }> {
    return this.httpClient.healthCheck();
  }

  /**
   * Get SDK version
   */
  static getVersion(): string {
    return '1.0.0';
  }

  /**
   * Create SDK instance with simplified configuration
   */
  static create(apiKey: string, environment: 'development' | 'staging' | 'production' = 'production'): CaasSDK {
    return new CaasSDK({
      apiKey,
      environment,
      timeout: 10000, // 10 seconds
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
      rateLimitPerHour: 1000
    });
  }
}

// Export types and classes
export * from './types/index.js';
export * from './core/http-client.js';
export * from './services/user.service.js';
export * from './services/credit.service.js';

// Export errors
export {
  CaasError,
  CaasAuthError,
  CaasRateLimitError,
  CaasValidationError,
};

// Default export
export default CaasSDK;

/**
 * Type-safe factory function for creating SDK instances
 */
export function createCaasSDK(config: SdkConfig): CaasSDK {
  return new CaasSDK(config);
}

/**
 * Utility function to validate API key format
 */
export function isValidApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && 
         apiKey.length > 0 && 
         (apiKey.startsWith('caas_') || apiKey.startsWith('sk_'));
}

/**
 * Utility function to get default base URL for environment
 */
export function getDefaultBaseUrl(environment: 'development' | 'staging' | 'production'): string {
  const baseUrls = {
    development: 'http://localhost:3000/api',
    staging: 'https://staging-api.caas-platform.com/api',
    production: 'https://api.caas-platform.com/api',
  };
  return baseUrls[environment];
}