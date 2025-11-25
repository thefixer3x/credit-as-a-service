import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import EventEmitter from 'eventemitter3';
import { 
  SdkConfig, 
  ApiResponse, 
  CaasError, 
  CaasAuthError, 
  CaasRateLimitError,
  SdkEvents 
} from '../types/index.js';

export class HttpClient extends EventEmitter<SdkEvents> {
  private client: AxiosInstance;
  private requestCount: number = 0;
  private lastResetTime: number = Date.now();
  private config: SdkConfig;

  constructor(config: SdkConfig) {
    super();
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.baseUrl || this.getDefaultBaseUrl(config.environment),
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-SDK-Version': '1.0.0',
        'X-SDK-Environment': config.environment,
      },
    });

    this.setupInterceptors();
  }

  private getDefaultBaseUrl(environment: string): string {
    const baseUrls = {
      development: 'http://localhost:3000/api',
      staging: 'https://staging-api.caas-platform.com/api',
      production: 'https://api.caas-platform.com/api',
    };
    return baseUrls[environment as keyof typeof baseUrls];
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        this.checkRateLimit();
        
        // Add request ID for tracing
        const requestId = this.generateRequestId();
        config.headers['X-Request-ID'] = requestId;
        
        // Emit request start event
        this.emit('request:start', {
          method: config.method?.toUpperCase() || 'GET',
          url: config.url || '',
          data: config.data,
        });

        return config;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const duration = this.calculateDuration(response.config);
        
        // Emit success event
        this.emit('request:success', {
          method: response.config.method?.toUpperCase() || 'GET',
          url: response.config.url || '',
          data: response.data,
          duration,
        });

        return response;
      },
      (error) => {
        const duration = this.calculateDuration(error.config);
        const caasError = this.handleError(error);
        
        // Emit error event
        this.emit('request:error', {
          method: error.config?.method?.toUpperCase() || 'GET',
          url: error.config?.url || '',
          error: caasError,
          duration,
        });

        return Promise.reject(caasError);
      }
    );
  }

  private checkRateLimit(): void {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    
    // Reset counter every hour
    if (now - this.lastResetTime > hourInMs) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    // Check if rate limit exceeded
    if (this.requestCount >= this.config.rateLimitPerHour) {
      const resetTime = this.lastResetTime + hourInMs;
      this.emit('rate:limit', { resetTime });
      throw new CaasRateLimitError(
        `Rate limit of ${this.config.rateLimitPerHour} requests per hour exceeded. Reset at ${new Date(resetTime).toISOString()}`
      );
    }

    this.requestCount++;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private calculateDuration(config: any): number {
    const requestStart = (config as any).metadata?.requestStartTime || Date.now();
    return Date.now() - requestStart;
  }

  private handleError(error: any): CaasError {
    if (error instanceof CaasError) {
      return error;
    }

    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          this.emit('auth:expired', { timestamp: new Date().toISOString() });
          return new CaasAuthError(data?.message || 'Authentication failed');
        
        case 429:
          return new CaasRateLimitError(data?.message || 'Rate limit exceeded');
        
        default:
          return new CaasError(
            data?.message || 'Request failed',
            data?.code || 'REQUEST_ERROR',
            data?.details,
            status
          );
      }
    }

    if (error.request) {
      return new CaasError(
        'Network error - no response received',
        'NETWORK_ERROR',
        { timeout: this.config.timeout }
      );
    }

    return new CaasError(
      error.message || 'Unknown error occurred',
      'UNKNOWN_ERROR',
      { originalError: error }
    );
  }

  async request<T = any>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    (config as any).metadata = { requestStartTime: Date.now(), startTime: Date.now() };
    
    try {
      const response: AxiosResponse<ApiResponse<T>> = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (this.shouldRetry(error as CaasError, config)) {
        return this.retryRequest<T>(config);
      }
      throw error;
    }
  }

  private shouldRetry(error: CaasError, config: AxiosRequestConfig): boolean {
    const retryableStatuses = [408, 429, 502, 503, 504];
    const currentAttempt = (config as any).retryCount || 0;
    
    return (
      currentAttempt < this.config.retryAttempts &&
      (retryableStatuses.includes(error.statusCode || 0) ||
       error.code === 'NETWORK_ERROR')
    );
  }

  private async retryRequest<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const currentRetryCount = ((config as any).retryCount || 0) + 1;
    const delay = this.config.retryDelay * Math.pow(2, currentRetryCount - 1); // Exponential backoff
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    (config as any).retryCount = currentRetryCount;
    return this.request<T>(config);
  }

  // HTTP Methods
  async get<T = any>(url: string, params?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      params,
    });
  }

  async post<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
    });
  }

  async put<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
    });
  }

  async patch<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      url,
      data,
    });
  }

  async delete<T = any>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
    });
  }

  // Configuration methods
  updateConfig(newConfig: Partial<SdkConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.apiKey) {
      this.client.defaults.headers['Authorization'] = `Bearer ${newConfig.apiKey}`;
    }
    
    if (newConfig.timeout) {
      this.client.defaults.timeout = newConfig.timeout;
    }
  }

  getConfig(): Readonly<SdkConfig> {
    return { ...this.config };
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; timestamp: string }> {
    try {
      const response = await this.get<{ status: string }>('/health');
      return {
        status: response.success ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }
}