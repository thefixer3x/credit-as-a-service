export interface DisbursementRequest {
  id: string;
  userId: string;
  applicationId: string;
  offerId: string;
  amount: number;
  currency: string;
  recipient: RecipientDetails;
  disbursementMethod: DisbursementMethod;
  purpose: string;
  reference: string;
  metadata?: Record<string, any>;
  scheduledAt?: Date;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  callbackUrl?: string;
}

export interface RecipientDetails {
  type: 'bank_account' | 'mobile_wallet' | 'card' | 'crypto_wallet';
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
  bankName?: string;
  phoneNumber?: string;
  walletProvider?: string;
  cardNumber?: string;
  walletAddress?: string;
  blockchain?: string;
  bvn?: string;
  routingNumber?: string;
  swiftCode?: string;
}

export interface DisbursementMethod {
  provider: PaymentProvider;
  channel: 'instant' | 'standard' | 'batch';
  fees: DisbursementFee[];
  estimatedDuration: string;
  limits: PaymentLimits;
}

export interface PaymentProvider {
  id: string;
  name: string;
  type: 'bank' | 'fintech' | 'crypto' | 'mobile_money';
  country: string;
  currencies: string[];
  isActive: boolean;
  config: ProviderConfig;
}

export interface ProviderConfig {
  apiUrl: string;
  apiKey?: string;
  merchantId?: string;
  publicKey?: string;
  secretKey?: string;
  environment: 'sandbox' | 'production';
  webhookUrl?: string;
  maxRetries: number;
  timeoutMs: number;
}

export interface DisbursementFee {
  type: 'fixed' | 'percentage' | 'tiered';
  amount: number;
  percentage?: number;
  tiers?: FeeTier[];
  description: string;
}

export interface FeeTier {
  minAmount: number;
  maxAmount: number;
  fee: number;
}

export interface PaymentLimits {
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
  monthlyLimit: number;
  perTransactionLimit: number;
}

export interface DisbursementResult {
  id: string;
  requestId: string;
  status: DisbursementStatus;
  amount: number;
  currency: string;
  fees: number;
  netAmount: number;
  reference: string;
  providerReference?: string;
  providerResponse?: Record<string, any>;
  processedAt?: Date;
  settledAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  logs: DisbursementLog[];
  webhook?: WebhookDelivery;
}

export type DisbursementStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded';

export interface DisbursementLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface WebhookDelivery {
  url: string;
  attempts: WebhookAttempt[];
  status: 'pending' | 'delivered' | 'failed';
  maxAttempts: number;
}

export interface WebhookAttempt {
  attemptNumber: number;
  timestamp: Date;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  duration: number;
}

export interface BatchDisbursement {
  id: string;
  name: string;
  description?: string;
  requests: DisbursementRequest[];
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  summary: BatchSummary;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

export interface BatchSummary {
  totalRequests: number;
  totalAmount: number;
  currency: string;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  totalFees: number;
  netAmount: number;
}

export interface DisbursementSettings {
  defaultProvider: string;
  retryPolicy: RetryPolicy;
  webhookSettings: WebhookSettings;
  securitySettings: SecuritySettings;
  complianceSettings: ComplianceSettings;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  retryableStatuses: string[];
  retryableErrorCodes: string[];
}

export interface WebhookSettings {
  enabled: boolean;
  defaultUrl?: string;
  signatureSecret: string;
  maxAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export interface SecuritySettings {
  encryptSensitiveData: boolean;
  requireTwoFactorAuth: boolean;
  ipWhitelist: string[];
  maxDailyAmount: number;
  requireApprovalAbove: number;
  auditAllTransactions: boolean;
}

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

export interface ProviderStatus {
  providerId: string;
  isOnline: boolean;
  responseTime: number;
  successRate: number;
  lastHealthCheck: Date;
  errorRate: number;
  maintenanceWindow?: MaintenanceWindow;
}

export interface MaintenanceWindow {
  startTime: Date;
  endTime: Date;
  description: string;
  impact: 'partial' | 'full';
}

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