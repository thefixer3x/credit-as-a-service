import { z } from 'zod';
import { CurrencyCode as CurrencyCodeSchema } from './common.js';

/**
 * Payment and Disbursement Types
 * Shared types for disbursement, repayment, and payment services
 */

// Re-export currency code from common (extended with additional currencies)
export const currencyCodeSchema = z.enum(['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP']);
export type PaymentCurrencyCode = z.infer<typeof currencyCodeSchema>;

// Priority levels
export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type Priority = z.infer<typeof prioritySchema>;

// Disbursement status
export const disbursementStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'refunded'
]);
export type DisbursementStatus = z.infer<typeof disbursementStatusSchema>;

/**
 * Recipient type with legacy aliases for backward compatibility
 */
export const recipientTypeSchema = z.enum([
  'bank_account',
  'mobile_wallet',
  'mobile_money',   // Legacy alias for mobile_wallet
  'card',
  'crypto_wallet',
  'wallet'          // Legacy alias for crypto_wallet
]);
export type RecipientType = z.infer<typeof recipientTypeSchema>;

/**
 * Recipient Details
 */
export const recipientDetailsSchema = z.object({
  type: recipientTypeSchema,
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  bankCode: z.string().optional(),
  bankName: z.string().optional(),
  phoneNumber: z.string().optional(),
  walletProvider: z.string().optional(),
  cardNumber: z.string().optional(),
  walletAddress: z.string().optional(),
  blockchain: z.string().optional(),
  bvn: z.string().optional(),
  routingNumber: z.string().optional(),
  swiftCode: z.string().optional(),
  network: z.string().optional(),
  country: z.string().optional(),
});

export type RecipientDetails = z.infer<typeof recipientDetailsSchema>;

/**
 * Fee Tier
 */
export const feeTierSchema = z.object({
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  fee: z.number().nonnegative(),
});

export type FeeTier = z.infer<typeof feeTierSchema>;

/**
 * Disbursement Fee
 */
export const disbursementFeeSchema = z.object({
  type: z.enum(['fixed', 'percentage', 'tiered']),
  amount: z.number().nonnegative(),
  percentage: z.number().min(0).max(100).optional(),
  tiers: z.array(feeTierSchema).optional(),
  description: z.string(),
});

export type DisbursementFee = z.infer<typeof disbursementFeeSchema>;

/**
 * Payment Limits
 */
export const paymentLimitsSchema = z.object({
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  dailyLimit: z.number().positive(),
  monthlyLimit: z.number().positive(),
  perTransactionLimit: z.number().positive(),
});

export type PaymentLimits = z.infer<typeof paymentLimitsSchema>;

/**
 * Provider Config
 */
export const providerConfigSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().optional(),
  merchantId: z.string().optional(),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
  environment: z.enum(['sandbox', 'production']),
  webhookUrl: z.string().url().optional(),
  maxRetries: z.number().int().nonnegative(),
  timeoutMs: z.number().int().positive(),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/**
 * Payment Provider
 */
export const paymentProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['bank', 'fintech', 'crypto', 'mobile_money']),
  country: z.string(),
  currencies: z.array(z.string()),
  isActive: z.boolean(),
  config: providerConfigSchema,
});

export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

/**
 * Disbursement Method
 */
export const disbursementMethodSchema = z.object({
  provider: paymentProviderSchema,
  channel: z.enum(['instant', 'standard', 'batch']),
  fees: z.array(disbursementFeeSchema),
  estimatedDuration: z.string(),
  limits: paymentLimitsSchema,
});

export type DisbursementMethod = z.infer<typeof disbursementMethodSchema>;

/**
 * Disbursement Request
 */
export const disbursementRequestSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  applicationId: z.string().uuid(),
  offerId: z.string().uuid(),
  amount: z.number().positive(),
  currency: currencyCodeSchema,
  recipient: recipientDetailsSchema,
  disbursementMethod: disbursementMethodSchema,
  purpose: z.string().min(1),
  reference: z.string().min(1),
  metadata: z.record(z.any()).optional(),
  scheduledAt: z.coerce.date().optional(),
  priority: prioritySchema,
  callbackUrl: z.string().url().optional(),
  createdAt: z.coerce.date().optional(),
  status: disbursementStatusSchema.optional(),
});

export type DisbursementRequest = z.infer<typeof disbursementRequestSchema>;

/**
 * Disbursement Log
 */
export const disbursementLogSchema = z.object({
  timestamp: z.coerce.date(),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type DisbursementLog = z.infer<typeof disbursementLogSchema>;

/**
 * Webhook Attempt
 */
export const webhookAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  timestamp: z.coerce.date(),
  httpStatus: z.number().int().optional(),
  responseBody: z.string().optional(),
  errorMessage: z.string().optional(),
  duration: z.number().nonnegative(),
});

export type WebhookAttempt = z.infer<typeof webhookAttemptSchema>;

/**
 * Webhook Delivery
 */
export const webhookDeliverySchema = z.object({
  url: z.string().url(),
  attempts: z.array(webhookAttemptSchema),
  status: z.enum(['pending', 'delivered', 'failed']),
  maxAttempts: z.number().int().positive(),
});

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

/**
 * Disbursement Result
 */
export const disbursementResultSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  status: disbursementStatusSchema,
  amount: z.number().positive(),
  currency: z.string(),
  fees: z.number().nonnegative(),
  netAmount: z.number(),
  reference: z.string(),
  providerReference: z.string().optional(),
  providerResponse: z.record(z.any()).optional(),
  processedAt: z.coerce.date().optional(),
  settledAt: z.coerce.date().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  retryCount: z.number().int().nonnegative(),
  logs: z.array(disbursementLogSchema),
  webhook: webhookDeliverySchema.optional(),
});

export type DisbursementResult = z.infer<typeof disbursementResultSchema>;

/**
 * Batch Summary
 */
export const batchSummarySchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  totalAmount: z.number().nonnegative(),
  currency: z.string(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  totalFees: z.number().nonnegative(),
  netAmount: z.number(),
});

export type BatchSummary = z.infer<typeof batchSummarySchema>;

/**
 * Batch Disbursement
 */
export const batchDisbursementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  requests: z.array(disbursementRequestSchema),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'partial']),
  summary: batchSummarySchema.optional(),
  createdAt: z.coerce.date(),
  processedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});

export type BatchDisbursement = z.infer<typeof batchDisbursementSchema>;
