import { z } from 'zod';

/**
 * Recipient type enum with legacy aliases for backward compatibility
 * - mobile_money is an alias for mobile_wallet
 * - wallet is an alias for crypto_wallet
 */
export const recipientTypeSchema = z.enum([
  'bank_account',
  'mobile_wallet',
  'mobile_money',  // Legacy alias for mobile_wallet
  'card',
  'crypto_wallet',
  'wallet',        // Legacy alias for crypto_wallet
]);

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
  network: z.string().optional(),  // Legacy field from old validation
  country: z.string().optional(),  // For compliance checks
});

export const feeTierSchema = z.object({
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  fee: z.number().nonnegative(),
});

export const disbursementFeeSchema = z.object({
  type: z.enum(['fixed', 'percentage', 'tiered']),
  amount: z.number().nonnegative(),
  percentage: z.number().min(0).max(100).optional(),
  tiers: z.array(feeTierSchema).optional(),
  description: z.string(),
});

export const paymentLimitsSchema = z.object({
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  dailyLimit: z.number().positive(),
  monthlyLimit: z.number().positive(),
  perTransactionLimit: z.number().positive(),
});

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

export const paymentProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['bank', 'fintech', 'crypto', 'mobile_money']),
  country: z.string(),
  currencies: z.array(z.string()),
  isActive: z.boolean(),
  config: providerConfigSchema,
});

export const disbursementMethodSchema = z.object({
  provider: paymentProviderSchema,
  channel: z.enum(['instant', 'standard', 'batch']),
  fees: z.array(disbursementFeeSchema),
  estimatedDuration: z.string(),
  limits: paymentLimitsSchema,
});

export const disbursementStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'refunded',
]);

export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const currencySchema = z.enum(['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP']);

/**
 * Strict validation schema for DisbursementRequest
 * Validates all required fields according to the TypeScript interface
 */
export const disbursementRequestSchema = z.object({
  id: z.string().min(1),
  userId: z.string().uuid(),
  applicationId: z.string().uuid(),
  offerId: z.string().uuid(),
  amount: z.number().positive(),
  currency: currencySchema,
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

/**
 * Legacy validation schema for backward compatibility
 * Used when STRICT_VALIDATION is disabled
 * Matches the original Zod schema from the controller
 */
export const legacyDisbursementRequestSchema = z.object({
  amount: z.number().positive(),
  currency: currencySchema,
  recipient: z.object({
    type: z.enum(['bank_account', 'mobile_money', 'wallet']),
    accountNumber: z.string().optional(),
    bankCode: z.string().optional(),
    accountName: z.string().optional(),
    phoneNumber: z.string().optional(),
    walletAddress: z.string().optional(),
    network: z.string().optional(),
  }),
  purpose: z.string(),
  reference: z.string().optional(),
  description: z.string().optional(),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Batch disbursement validation schema
 */
export const batchDisbursementSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requests: z.array(disbursementRequestSchema),
});

/**
 * Type exports inferred from schemas
 */
export type DisbursementRequestInput = z.infer<typeof disbursementRequestSchema>;
export type LegacyDisbursementRequestInput = z.infer<typeof legacyDisbursementRequestSchema>;
export type BatchDisbursementInput = z.infer<typeof batchDisbursementSchema>;
export type RecipientType = z.infer<typeof recipientTypeSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Currency = z.infer<typeof currencySchema>;
