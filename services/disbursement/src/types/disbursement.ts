/**
 * Disbursement Service Types
 *
 * Re-exports shared types from @caas/types for backward compatibility.
 * Service-specific types that shouldn't be shared are defined locally below.
 */

// Re-export shared types from @caas/types
export type {
  CurrencyCode,
  Priority,
  DisbursementStatus,
  RecipientType,
  RecipientDetails,
  FeeTier,
  DisbursementFee,
  PaymentLimits,
  ProviderConfig,
  PaymentProvider,
  DisbursementMethod,
  DisbursementRequest,
  DisbursementLog,
  WebhookAttempt,
  WebhookDelivery,
  DisbursementResult,
  BatchSummary,
  BatchDisbursement,
} from '@caas/types';

// Re-export schemas for validation
export {
  currencyCodeSchema,
  prioritySchema,
  disbursementStatusSchema,
  recipientTypeSchema,
  recipientDetailsSchema,
  feeTierSchema,
  disbursementFeeSchema,
  paymentLimitsSchema,
  providerConfigSchema,
  paymentProviderSchema,
  disbursementMethodSchema,
  disbursementRequestSchema,
  disbursementLogSchema,
  webhookAttemptSchema,
  webhookDeliverySchema,
  disbursementResultSchema,
  batchSummarySchema,
  batchDisbursementSchema,
} from '@caas/types';

/**
 * Service-Specific Types (not shared)
 * These types are internal to the disbursement service
 */

// Retry Policy (service configuration)
export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  retryableStatuses: string[];
  retryableErrorCodes: string[];
}

// Webhook Settings (service configuration)
export interface WebhookSettings {
  enabled: boolean;
  defaultUrl?: string;
  signatureSecret: string;
  maxAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
}

// Security Settings (service configuration)
export interface SecuritySettings {
  encryptSensitiveData: boolean;
  requireTwoFactorAuth: boolean;
  ipWhitelist: string[];
  maxDailyAmount: number;
  requireApprovalAbove: number;
  auditAllTransactions: boolean;
}

// Compliance Settings (service configuration)
export interface ComplianceSettings {
  amlScreening: boolean;
  sanctionsCheck: boolean;
  maxSingleTransaction: number;
  maxDailyVolume: number;
  maxMonthlyVolume: number;
  requireDocuments: boolean;
  restrictedCountries: string[];
  restrictedPurposes: string[];
}

// Disbursement Service Settings (aggregate)
export interface DisbursementSettings {
  defaultProvider: string;
  retryPolicy: RetryPolicy;
  webhookSettings: WebhookSettings;
  securitySettings: SecuritySettings;
  complianceSettings: ComplianceSettings;
}

// Provider Status (runtime state)
export interface ProviderStatus {
  providerId: string;
  isOnline: boolean;
  responseTime: number;
  successRate: number;
  lastHealthCheck: Date;
  errorRate: number;
  maintenanceWindow?: MaintenanceWindow;
}

// Maintenance Window
export interface MaintenanceWindow {
  startTime: Date;
  endTime: Date;
  description: string;
  impact: 'partial' | 'full';
}

// Analytics Types
export interface DisbursementAnalytics {
  period: string;
  totalVolume: number;
  totalTransactions: number;
  successRate: number;
  averageProcessingTime: number;
  topProviders: ProviderStats[];
  topDestinations: DestinationStats[];
  errorBreakdown: ErrorStats[];
  volumeByDay: VolumeStats[];
}

export interface ProviderStats {
  providerId: string;
  providerName: string;
  volume: number;
  transactions: number;
  successRate: number;
  averageTime: number;
}

export interface DestinationStats {
  country: string;
  currency: string;
  volume: number;
  transactions: number;
}

export interface ErrorStats {
  errorCode: string;
  errorMessage: string;
  count: number;
  percentage: number;
}

export interface VolumeStats {
  date: string;
  volume: number;
  transactions: number;
}

// Reconciliation Types
export interface ReconciliationReport {
  date: string;
  providerId: string;
  totalSent: number;
  totalReceived: number;
  discrepancy: number;
  status: 'matched' | 'discrepancy' | 'pending';
  transactions: ReconciliationTransaction[];
}

export interface ReconciliationTransaction {
  internalId: string;
  providerReference: string;
  amount: number;
  status: 'matched' | 'missing' | 'extra';
  discrepancy?: number;
}
