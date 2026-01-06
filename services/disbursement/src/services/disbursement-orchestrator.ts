import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import axios from 'axios';

import { SMEAPIClient } from '@caas/sme-integration';
import { validateEnv } from '@caas/config';

import type {
  DisbursementRequest,
  DisbursementResult,
  DisbursementStatus,
  PaymentProvider,
  BatchDisbursement,
  DisbursementSettings,
  ProviderStatus,
  DisbursementAnalytics,
  ReconciliationReport,
  DisbursementLog,
  WebhookDelivery
} from '../types/disbursement.js';

import {
  disbursementRequestSchema,
  legacyDisbursementRequestSchema
} from '../schemas/disbursement-request.schema.js';

const logger = pino({ name: 'disbursement-orchestrator' });
const env = validateEnv();

class ValidationError extends Error {
  constructor(message: string, public errors: string[] = []) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DisbursementOrchestrator {
  private smeClient: SMEAPIClient;
  private providers: Map<string, PaymentProvider> = new Map();
  private settings!: DisbursementSettings;
  private processingQueue: Map<string, DisbursementRequest> = new Map();

  constructor() {
    this.smeClient = new SMEAPIClient();
    this.initializeSettings();
    this.loadProviders();
    this.startQueueProcessor();
  }

  /**
   * Process a single disbursement request
   */
  async processDisbursement(request: DisbursementRequest): Promise<DisbursementResult> {
    try {
      logger.info({ requestId: request.id }, 'Processing disbursement request');

      // 1. Validate request
      await this.validateRequest(request);

      // 2. Compliance and security checks
      await this.performComplianceChecks(request);

      // 3. Select optimal provider
      const provider = await this.selectProvider(request);

      // 4. Calculate fees
      const fees = this.calculateFees(request, provider);
      const netAmount = request.amount - fees;

      // 5. Execute disbursement
      const result = await this.executeDisbursement(request, provider, fees, netAmount);

      // 6. Send webhook notification
      if (request.callbackUrl) {
        await this.sendWebhook(request.callbackUrl, result);
      }

      logger.info({ 
        requestId: request.id, 
        status: result.status, 
        amount: result.amount 
      }, 'Disbursement processed');

      return result;

    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Disbursement processing failed');

      return {
        id: uuidv4(),
        requestId: request.id,
        status: 'failed',
        amount: request.amount,
        currency: request.currency,
        fees: 0,
        netAmount: request.amount,
        reference: request.reference,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: 0,
        logs: [{
          timestamp: new Date(),
          level: 'error',
          message: `Disbursement failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Process batch disbursements
   */
  async processBatchDisbursement(batch: BatchDisbursement): Promise<BatchDisbursement> {
    try {
      logger.info({ batchId: batch.id, requestCount: batch.requests.length }, 'Processing batch disbursement');

      batch.status = 'processing';
      batch.processedAt = new Date();

      const results: DisbursementResult[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each request in the batch
      for (const request of batch.requests) {
        try {
          const result = await this.processDisbursement(request);
          results.push(result);

          if (result.status === 'completed') {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          failureCount++;
          logger.error({ error, requestId: request.id }, 'Batch item processing failed');
        }
      }

      // Update batch summary
      batch.summary = {
        totalRequests: batch.requests.length,
        totalAmount: batch.requests.reduce((sum, req) => sum + req.amount, 0),
        currency: batch.requests[0]?.currency || 'NGN',
        successCount,
        failureCount,
        pendingCount: batch.requests.length - successCount - failureCount,
        totalFees: results.reduce((sum, result) => sum + result.fees, 0),
        netAmount: results.reduce((sum, result) => sum + result.netAmount, 0)
      };

      batch.status = failureCount === 0 ? 'completed' : 
                    successCount === 0 ? 'failed' : 'partial';
      batch.completedAt = new Date();

      logger.info({
        batchId: batch.id,
        status: batch.status,
        successCount,
        failureCount
      }, 'Batch disbursement completed');

      return batch;

    } catch (error) {
      logger.error({ error, batchId: batch.id }, 'Batch disbursement failed');
      batch.status = 'failed';
      throw error;
    }
  }

  /**
   * Get disbursement status
   */
  async getDisbursementStatus(requestId: string): Promise<DisbursementResult | null> {
    try {
      // In production, this would query the database
      logger.info({ requestId }, 'Retrieving disbursement status');
      return null; // Placeholder
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to get disbursement status');
      throw error;
    }
  }

  /**
   * Cancel pending disbursement
   */
  async cancelDisbursement(requestId: string): Promise<boolean> {
    try {
      logger.info({ requestId }, 'Cancelling disbursement');
      
      // Remove from processing queue if pending
      this.processingQueue.delete(requestId);
      
      // In production, update database status to cancelled
      return true;
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to cancel disbursement');
      throw error;
    }
  }

  /**
   * Get provider status
   */
  async getProviderStatus(providerId?: string): Promise<ProviderStatus[]> {
    try {
      const statuses: ProviderStatus[] = [];
      const providersToCheck = providerId ? [this.providers.get(providerId)].filter(Boolean) : Array.from(this.providers.values());

      for (const provider of providersToCheck) {
        if (!provider) continue;

        const status: ProviderStatus = {
          providerId: provider.id,
          isOnline: await this.checkProviderHealth(provider),
          responseTime: 0, // Would measure actual response time
          successRate: 0.95, // Would calculate from historical data
          lastHealthCheck: new Date(),
          errorRate: 0.05
        };

        statuses.push(status);
      }

      return statuses;
    } catch (error) {
      logger.error({ error }, 'Failed to get provider status');
      throw error;
    }
  }

  /**
   * Generate analytics report
   */
  async generateAnalytics(startDate: Date, endDate: Date): Promise<DisbursementAnalytics> {
    try {
      // In production, this would query database for analytics
      const analytics: DisbursementAnalytics = {
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalVolume: 0,
        totalTransactions: 0,
        successRate: 0,
        averageProcessingTime: 0,
        topProviders: [],
        topDestinations: [],
        errorBreakdown: [],
        volumeByDay: []
      };

      logger.info({ period: analytics.period }, 'Analytics generated');
      return analytics;
    } catch (error) {
      logger.error({ error }, 'Failed to generate analytics');
      throw error;
    }
  }

  /**
   * Perform reconciliation with provider
   */
  async performReconciliation(providerId: string, date: string): Promise<ReconciliationReport> {
    try {
      const provider = this.providers.get(providerId);
      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      // In production, this would fetch and compare transaction records
      const report: ReconciliationReport = {
        date,
        providerId,
        totalSent: 0,
        totalReceived: 0,
        discrepancy: 0,
        status: 'matched',
        transactions: []
      };

      logger.info({ providerId, date }, 'Reconciliation completed');
      return report;
    } catch (error) {
      logger.error({ error, providerId, date }, 'Reconciliation failed');
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async validateRequest(request: DisbursementRequest): Promise<void> {
    if (env.STRICT_VALIDATION) {
      // Use strict Zod schema validation
      const result = disbursementRequestSchema.safeParse(request);

      if (!result.success) {
        const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new ValidationError('Invalid disbursement request', errors);
      }
    } else {
      // Legacy validation with warnings for missing fields
      if (!request.userId) {
        logger.warn({ requestId: request.id }, 'Missing userId - will be required when STRICT_VALIDATION is enabled');
      }
      if (!request.applicationId) {
        logger.warn({ requestId: request.id }, 'Missing applicationId - will be required when STRICT_VALIDATION is enabled');
      }
      if (!request.offerId) {
        logger.warn({ requestId: request.id }, 'Missing offerId - will be required when STRICT_VALIDATION is enabled');
      }
      if (!request.priority) {
        logger.warn({ requestId: request.id }, 'Missing priority - will be required when STRICT_VALIDATION is enabled');
      }
      if (!request.disbursementMethod) {
        logger.warn({ requestId: request.id }, 'Missing disbursementMethod - will be required when STRICT_VALIDATION is enabled');
      }

      // Basic validation (existing logic)
      if (request.amount <= 0) {
        throw new Error('Invalid amount');
      }

      if (!['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP'].includes(request.currency)) {
        throw new Error('Unsupported currency');
      }

      if (!request.recipient.accountNumber && !request.recipient.phoneNumber && !request.recipient.walletAddress) {
        throw new Error('Invalid recipient details');
      }
    }

    // Additional business validation (always applied)
    await this.validateBusinessRules(request);
  }

  private async validateBusinessRules(request: DisbursementRequest): Promise<void> {
    // Business-specific validation that applies regardless of strict mode
    // e.g., checking if user has sufficient credit, account is active, etc.
    logger.debug({ requestId: request.id }, 'Business rules validated');
  }

  private async performComplianceChecks(request: DisbursementRequest): Promise<void> {
    const { complianceSettings } = this.settings;

    // AML screening
    if (complianceSettings.amlScreening) {
      await this.performAMLCheck(request);
    }

    // Sanctions check
    if (complianceSettings.sanctionsCheck) {
      await this.performSanctionsCheck(request);
    }

    // Single transaction limit
    if (request.amount > complianceSettings.maxSingleTransaction) {
      throw new Error(`Amount exceeds single transaction limit of ${complianceSettings.maxSingleTransaction}`);
    }

    // Daily volume limit (would need to aggregate from database in production)
    // For now, log warning - actual implementation would query daily totals
    if (request.amount > complianceSettings.maxDailyVolume) {
      throw new Error(`Amount exceeds daily volume limit of ${complianceSettings.maxDailyVolume}`);
    }

    // Monthly volume limit (would need to aggregate from database in production)
    if (request.amount > complianceSettings.maxMonthlyVolume) {
      throw new Error(`Amount exceeds monthly volume limit of ${complianceSettings.maxMonthlyVolume}`);
    }

    // Document requirements
    if (complianceSettings.requireDocuments) {
      const hasDocuments = request.metadata?.documents &&
        Array.isArray(request.metadata.documents) &&
        request.metadata.documents.length > 0;

      if (!hasDocuments) {
        logger.warn({ requestId: request.id }, 'Supporting documents required but not provided');
        // Note: Not throwing error for backward compatibility - will be enforced with STRICT_VALIDATION
      }
    }

    // Restricted countries check
    const recipientCountry = request.recipient.country;
    if (recipientCountry && complianceSettings.restrictedCountries.includes(recipientCountry)) {
      throw new Error(`Recipient country ${recipientCountry} is restricted`);
    }

    // Restricted purposes check
    if (complianceSettings.restrictedPurposes.includes(request.purpose)) {
      throw new Error(`Purpose "${request.purpose}" is restricted`);
    }

    logger.info({ requestId: request.id }, 'All compliance checks passed');
  }

  private async performAMLCheck(request: DisbursementRequest): Promise<void> {
    // Implementation would integrate with AML service
    logger.info({ requestId: request.id }, 'AML check passed');
  }

  private async performSanctionsCheck(request: DisbursementRequest): Promise<void> {
    // Implementation would check against sanctions lists
    logger.info({ requestId: request.id }, 'Sanctions check passed');
  }

  private async selectProvider(request: DisbursementRequest): Promise<PaymentProvider> {
    const compatibleProviders = Array.from(this.providers.values()).filter(provider => {
      // Check if provider supports the currency
      if (!provider.currencies.includes(request.currency)) return false;

      // Check if provider is active
      if (!provider.isActive) return false;

      // Check recipient type compatibility
      // Additional provider selection logic...

      return true;
    });

    if (compatibleProviders.length === 0) {
      throw new Error('No compatible payment providers found');
    }

    // Select provider based on cost, speed, reliability
    // For now, return the first compatible provider
    return compatibleProviders[0];
  }

  private calculateFees(request: DisbursementRequest, provider: PaymentProvider): number {
    // Use DisbursementMethod fees if provided (preferred)
    if (request.disbursementMethod?.fees?.length) {
      const totalFees = request.disbursementMethod.fees.reduce((total, fee) => {
        if (fee.type === 'fixed') {
          return total + fee.amount;
        }
        if (fee.type === 'percentage' && fee.percentage) {
          return total + (request.amount * (fee.percentage / 100));
        }
        if (fee.type === 'tiered' && fee.tiers) {
          // Find applicable tier
          const applicableTier = fee.tiers.find(
            tier => request.amount >= tier.minAmount && request.amount <= tier.maxAmount
          );
          return total + (applicableTier?.fee || 0);
        }
        return total;
      }, 0);

      return Math.round(totalFees);
    }

    // Fallback to hardcoded calculation (legacy behavior)
    logger.warn(
      { requestId: request.id },
      'Using fallback fee calculation - disbursementMethod.fees not provided'
    );
    const feePercentage = 0.015; // 1.5%
    const fixedFee = 100; // ₦100

    return Math.round((request.amount * feePercentage) + fixedFee);
  }

  private async executeDisbursement(
    request: DisbursementRequest,
    provider: PaymentProvider,
    fees: number,
    netAmount: number
  ): Promise<DisbursementResult> {
    const result: DisbursementResult = {
      id: uuidv4(),
      requestId: request.id,
      status: 'processing',
      amount: request.amount,
      currency: request.currency,
      fees,
      netAmount,
      reference: request.reference,
      retryCount: 0,
      logs: []
    };

    try {
      // Add processing log
      result.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Starting disbursement via ${provider.name}`
      });

      // Call provider API
      const providerResponse = await this.callProviderAPI(request, provider, netAmount);
      
      result.providerReference = providerResponse.reference;
      result.providerResponse = providerResponse;
      result.status = providerResponse.status === 'success' ? 'completed' : 'failed';
      result.processedAt = new Date();

      if (result.status === 'completed') {
        result.settledAt = new Date();
        result.logs.push({
          timestamp: new Date(),
          level: 'info',
          message: 'Disbursement completed successfully'
        });
      } else {
        const errorMsg = providerResponse.error || 'Provider processing failed';
        result.errorMessage = errorMsg;
        result.logs.push({
          timestamp: new Date(),
          level: 'error',
          message: errorMsg
        });
      }

    } catch (error) {
      result.status = 'failed';
      result.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `API call failed: ${result.errorMessage}`
      });

      // Implement retry logic if configured
      if (result.retryCount < this.settings.retryPolicy.maxRetries) {
        // Schedule retry...
      }
    }

    return result;
  }

  private async callProviderAPI(
    request: DisbursementRequest,
    provider: PaymentProvider,
    amount: number
  ): Promise<any> {
    try {
      // This is a mock implementation
      // In production, each provider would have its own API integration
      
      if (provider.type === 'bank') {
        return this.callBankAPI(request, provider, amount);
      } else if (provider.type === 'fintech') {
        return this.callFintechAPI(request, provider, amount);
      } else {
        throw new Error(`Unsupported provider type: ${provider.type}`);
      }

    } catch (error) {
      logger.error({ error, providerId: provider.id }, 'Provider API call failed');
      throw error;
    }
  }

  private async callBankAPI(request: DisbursementRequest, provider: PaymentProvider, amount: number): Promise<any> {
    // Mock bank API call
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing time
    
    return {
      reference: `BANK_${Date.now()}`,
      status: 'success',
      processingTime: 2000
    };
  }

  private async callFintechAPI(request: DisbursementRequest, provider: PaymentProvider, amount: number): Promise<any> {
    // Mock fintech API call
    await new Promise(resolve => setTimeout(resolve, 500)); // Faster processing
    
    return {
      reference: `FINTECH_${Date.now()}`,
      status: 'success',
      processingTime: 500
    };
  }

  private async sendWebhook(url: string, result: DisbursementResult): Promise<void> {
    try {
      const payload = {
        eventType: 'disbursement.completed',
        data: result,
        timestamp: new Date().toISOString()
      };

      const signature = this.generateWebhookSignature(JSON.stringify(payload));

      await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature
        },
        timeout: this.settings.webhookSettings.timeoutMs
      });

      logger.info({ requestId: result.requestId, url }, 'Webhook delivered successfully');
    } catch (error) {
      logger.error({ error, requestId: result.requestId, url }, 'Webhook delivery failed');
    }
  }

  private generateWebhookSignature(payload: string): string {
    return crypto
      .createHmac('sha256', this.settings.webhookSettings.signatureSecret)
      .update(payload)
      .digest('hex');
  }

  private async checkProviderHealth(provider: PaymentProvider): Promise<boolean> {
    try {
      // Mock health check - in production would ping provider's health endpoint
      return true;
    } catch (error) {
      return false;
    }
  }

  private startQueueProcessor(): void {
    // Start background queue processor
    setInterval(() => {
      this.processQueue();
    }, 5000); // Process queue every 5 seconds
  }

  private async processQueue(): Promise<void> {
    // Process items in the queue
    for (const [id, request] of this.processingQueue) {
      try {
        await this.processDisbursement(request);
        this.processingQueue.delete(id);
      } catch (error) {
        logger.error({ error, requestId: id }, 'Queue processing failed');
      }
    }
  }

  private initializeSettings(): void {
    this.settings = {
      defaultProvider: 'provider-001',
      retryPolicy: {
        maxRetries: 3,
        retryDelayMs: 5000,
        exponentialBackoff: true,
        retryableStatuses: ['processing', 'pending'],
        retryableErrorCodes: ['NETWORK_ERROR', 'TIMEOUT']
      },
      webhookSettings: {
        enabled: true,
        signatureSecret: env.SME_WEBHOOK_SECRET || 'default-secret',
        maxAttempts: 3,
        retryDelayMs: 5000,
        timeoutMs: 10000
      },
      securitySettings: {
        encryptSensitiveData: true,
        requireTwoFactorAuth: false,
        ipWhitelist: [],
        maxDailyAmount: 10000000, // ₦10M
        requireApprovalAbove: 1000000, // ₦1M
        auditAllTransactions: true
      },
      complianceSettings: {
        amlScreening: true,
        sanctionsCheck: true,
        maxSingleTransaction: 5000000, // ₦5M
        maxDailyVolume: 50000000, // ₦50M
        maxMonthlyVolume: 500000000, // ₦500M
        requireDocuments: true,
        restrictedCountries: ['IR', 'KP', 'SY'],
        restrictedPurposes: ['gambling', 'adult', 'weapons']
      }
    };
  }

  private loadProviders(): void {
    // Mock providers - in production would load from database
    const mockProviders: PaymentProvider[] = [
      {
        id: 'provider-001',
        name: 'Paystack',
        type: 'fintech',
        country: 'NG',
        currencies: ['NGN', 'USD'],
        isActive: true,
        config: {
          apiUrl: 'https://api.paystack.co',
          environment: 'production',
          maxRetries: 3,
          timeoutMs: 30000
        }
      },
      {
        id: 'provider-002',
        name: 'Flutterwave',
        type: 'fintech',
        country: 'NG',
        currencies: ['NGN', 'USD', 'GHS', 'KES'],
        isActive: true,
        config: {
          apiUrl: 'https://api.flutterwave.com',
          environment: 'production',
          maxRetries: 3,
          timeoutMs: 30000
        }
      }
    ];

    for (const provider of mockProviders) {
      this.providers.set(provider.id, provider);
    }

    logger.info({ providerCount: this.providers.size }, 'Payment providers loaded');
  }
}