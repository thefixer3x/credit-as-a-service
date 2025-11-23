import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { validateEnv } from '@caas/config';
import pino from 'pino';
import retry from 'retry';
import { createHmac, timingSafeEqual } from 'crypto';

const logger = pino({ name: 'sme-api-client' });
const env = validateEnv();

export interface SMEAPIConfig {
  baseURL: string;
  apiKey: string;
  timeout: number;
  retries: number;
}

export interface SMEUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  businessId?: string;
  permissions: string[];
  createdAt: string;
  lastLoginAt?: string;
}

export interface SMEKYCData {
  userId: string;
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  documents: Array<{
    id: string;
    type: string;
    url: string;
    status: string;
    verifiedAt?: string;
  }>;
  riskScore?: number;
  verificationDate?: string;
  expiresAt?: string;
}

export interface SMEPaymentAccount {
  id: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  isVirtual: boolean;
  isActive: boolean;
  userId: string;
  businessId?: string;
}

export interface SMETransactionData {
  id: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed';
  reference: string;
  description: string;
  accountId: string;
  metadata?: Record<string, any>;
  createdAt: string;
  completedAt?: string;
}

export class SMEAPIClient {
  private client: AxiosInstance;
  private config: SMEAPIConfig;

  constructor(config?: Partial<SMEAPIConfig>) {
    this.config = {
      baseURL: env.SME_API_BASE_URL,
      apiKey: env.SME_API_KEY,
      timeout: config?.timeout || 30000,
      retries: config?.retries || 3,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CaaS-Platform/1.0.0',
        'X-Source': 'credit-as-a-service',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for logging and correlation
    this.client.interceptors.request.use(
      (config) => {
        const correlationId = crypto.randomUUID();
        config.headers['X-Correlation-ID'] = correlationId;
        
        logger.info({
          correlationId,
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        }, 'SME API request');

        return config;
      },
      (error) => {
        logger.error({ error: error.message }, 'SME API request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        const correlationId = response.config.headers['X-Correlation-ID'];
        logger.info({
          correlationId,
          status: response.status,
          statusText: response.statusText,
        }, 'SME API response');

        return response;
      },
      (error) => {
        const correlationId = error.config?.headers['X-Correlation-ID'];
        logger.error({
          correlationId,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
        }, 'SME API response error');

        return Promise.reject(error);
      }
    );
  }

  private async retryRequest<T>(operation: () => Promise<AxiosResponse<T>>): Promise<T> {
    return new Promise((resolve, reject) => {
      const operation_with_retry = retry.operation({
        retries: this.config.retries,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
      });

      operation_with_retry.attempt(async (currentAttempt: number) => {
        try {
          const response = await operation();
          resolve(response.data);
        } catch (error: any) {
          if (operation_with_retry.retry(error)) {
            logger.warn({
              attempt: currentAttempt,
              error: error.message,
            }, 'Retrying SME API request');
            return;
          }
          reject(operation_with_retry.mainError());
        }
      });
    });
  }

  // User Management APIs
  async getUser(userId: string): Promise<SMEUser> {
    return this.retryRequest(() => 
      this.client.get<SMEUser>(`/v1/users/${userId}`)
    );
  }

  async getUserByEmail(email: string): Promise<SMEUser> {
    return this.retryRequest(() => 
      this.client.get<SMEUser>(`/v1/users/by-email/${email}`)
    );
  }

  async updateUserPermissions(userId: string, permissions: string[]): Promise<SMEUser> {
    return this.retryRequest(() => 
      this.client.patch<SMEUser>(`/v1/users/${userId}/permissions`, { permissions })
    );
  }

  // KYC APIs
  async getKYCData(userId: string): Promise<SMEKYCData> {
    return this.retryRequest(() => 
      this.client.get<SMEKYCData>(`/v1/kyc/${userId}`)
    );
  }

  async triggerKYCReview(userId: string, reason: string): Promise<{ success: boolean }> {
    return this.retryRequest(() => 
      this.client.post<{ success: boolean }>(`/v1/kyc/${userId}/review`, { reason })
    );
  }

  async getKYCDocuments(userId: string): Promise<SMEKYCData['documents']> {
    return this.retryRequest(() => 
      this.client.get<SMEKYCData['documents']>(`/v1/kyc/${userId}/documents`)
    );
  }

  // Payment Account APIs
  async getPaymentAccounts(userId: string): Promise<SMEPaymentAccount[]> {
    return this.retryRequest(() => 
      this.client.get<SMEPaymentAccount[]>(`/v1/payment-accounts/user/${userId}`)
    );
  }

  async createVirtualAccount(userId: string, purpose: string): Promise<SMEPaymentAccount> {
    return this.retryRequest(() => 
      this.client.post<SMEPaymentAccount>('/v1/payment-accounts/virtual', {
        userId,
        purpose,
        metadata: { source: 'credit-service' }
      })
    );
  }

  async getAccountBalance(accountId: string): Promise<{ balance: number; currency: string }> {
    return this.retryRequest(() => 
      this.client.get<{ balance: number; currency: string }>(`/v1/payment-accounts/${accountId}/balance`)
    );
  }

  // Transaction APIs
  async getTransactions(accountId: string, options?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<SMETransactionData[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.startDate) params.append('start_date', options.startDate);
    if (options?.endDate) params.append('end_date', options.endDate);

    return this.retryRequest(() => 
      this.client.get<SMETransactionData[]>(`/v1/transactions/account/${accountId}?${params}`)
    );
  }

  async initiateTransfer(data: {
    accountId: string;
    amount: number;
    currency: string;
    recipientAccount: string;
    recipientBank: string;
    description: string;
    reference: string;
  }): Promise<SMETransactionData> {
    return this.retryRequest(() => 
      this.client.post<SMETransactionData>('/v1/transactions/transfer', data)
    );
  }

  async getTransactionStatus(transactionId: string): Promise<SMETransactionData> {
    return this.retryRequest(() => 
      this.client.get<SMETransactionData>(`/v1/transactions/${transactionId}`)
    );
  }

  // Webhook APIs
  async registerWebhook(url: string, events: string[]): Promise<{ id: string; secret: string }> {
    return this.retryRequest(() => 
      this.client.post<{ id: string; secret: string }>('/v1/webhooks', {
        url,
        events,
        description: 'Credit-as-a-Service Platform',
      })
    );
  }

  async verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  // Authentication APIs
  async validateToken(token: string): Promise<{ valid: boolean; user?: SMEUser }> {
    return this.retryRequest(() => 
      this.client.post<{ valid: boolean; user?: SMEUser }>('/v1/auth/validate', { token })
    );
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    return this.retryRequest(() => 
      this.client.post<{ accessToken: string; refreshToken: string }>('/v1/auth/refresh', { 
        refreshToken 
      })
    );
  }

  // Health Check
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; timestamp: string }> {
    try {
      const response = await this.client.get('/health');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error }, 'SME API health check failed');
      return {
        status: 'down',
        timestamp: new Date().toISOString(),
      };
    }
  }
}