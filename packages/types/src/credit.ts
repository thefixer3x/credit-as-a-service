import { z } from 'zod';

/**
 * Credit Assessment Types
 * Shared types for credit underwriting and assessment services
 */

// Risk grade enum
export const riskGradeSchema = z.enum(['A', 'B', 'C', 'D', 'E']);
export type RiskGrade = z.infer<typeof riskGradeSchema>;

// Recommendation enum
export const recommendationSchema = z.enum([
  'approve',
  'approve_with_conditions',
  'reject',
  'refer_for_manual_review'
]);
export type Recommendation = z.infer<typeof recommendationSchema>;

// Credit history item type
export const creditHistoryTypeSchema = z.enum(['loan', 'credit_card', 'mortgage', 'utility']);
export type CreditHistoryType = z.infer<typeof creditHistoryTypeSchema>;

// Credit status
export const creditStatusSchema = z.enum(['current', 'late', 'defaulted', 'closed']);
export type CreditStatus = z.infer<typeof creditStatusSchema>;

// Payment status
export const paymentStatusSchema = z.enum(['on_time', 'late', 'missed']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Credit Assessment Request
 */
export const creditAssessmentRequestSchema = z.object({
  userId: z.string().uuid(),
  applicationId: z.string().uuid(),
  requestedAmount: z.number().positive(),
  currency: z.string(),
  purpose: z.string(),
  organizationId: z.string().uuid().optional(),
  additionalData: z.record(z.any()).optional(),
});

export type CreditAssessmentRequest = z.infer<typeof creditAssessmentRequestSchema>;

/**
 * Credit Assessment Result
 */
export const creditAssessmentResultSchema = z.object({
  assessmentId: z.string().uuid(),
  userId: z.string().uuid(),
  applicationId: z.string().uuid(),
  riskScore: z.number().min(0).max(1000),
  riskGrade: riskGradeSchema,
  probabilityOfDefault: z.number().min(0).max(1),
  recommendation: recommendationSchema,
  recommendedAmount: z.number().positive().optional(),
  recommendedRate: z.number().min(0).max(100).optional(),
  recommendedTerm: z.number().int().positive().optional(),
  conditions: z.array(z.string()).optional(),
  riskFactors: z.array(z.string()),
  positiveFactors: z.array(z.string()),
  confidenceLevel: z.number().min(0).max(1),
  modelVersion: z.string(),
  processedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

export type CreditAssessmentResult = z.infer<typeof creditAssessmentResultSchema>;

/**
 * Credit History Item
 */
export const creditHistoryItemSchema = z.object({
  type: creditHistoryTypeSchema,
  amount: z.number().nonnegative(),
  status: creditStatusSchema,
  monthsHistory: z.number().int().nonnegative(),
  paymentHistory: z.array(paymentStatusSchema),
});

export type CreditHistoryItem = z.infer<typeof creditHistoryItemSchema>;

/**
 * Financial Data
 */
export const financialDataSchema = z.object({
  monthlyIncome: z.number().nonnegative(),
  monthlyExpenses: z.number().nonnegative(),
  existingDebt: z.number().nonnegative(),
  bankBalance: z.number(),
  cashFlow: z.number(),
  creditHistory: z.array(creditHistoryItemSchema).optional(),
  businessRevenue: z.number().nonnegative().optional(),
  businessExpenses: z.number().nonnegative().optional(),
});

export type FinancialData = z.infer<typeof financialDataSchema>;

/**
 * Risk Factors
 */
export const riskFactorsSchema = z.object({
  debtToIncomeRatio: z.number().min(0),
  creditUtilization: z.number().min(0).max(1),
  paymentHistory: z.number().min(0).max(1),
  lengthOfHistory: z.number().int().nonnegative(),
  accountTypes: z.number().int().nonnegative(),
  recentInquiries: z.number().int().nonnegative(),
  businessStability: z.number().min(0).max(1).optional(),
  industryRisk: z.number().min(0).max(1).optional(),
});

export type RiskFactors = z.infer<typeof riskFactorsSchema>;

/**
 * Credit Offer
 */
export const creditOfferSchema = z.object({
  offerId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  userId: z.string().uuid(),
  applicationId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string(),
  interestRate: z.number().min(0).max(100),
  term: z.number().int().positive(),
  termUnit: z.enum(['days', 'weeks', 'months', 'years']),
  monthlyPayment: z.number().positive(),
  totalRepayment: z.number().positive(),
  fees: z.array(z.object({
    name: z.string(),
    amount: z.number().nonnegative(),
    type: z.enum(['fixed', 'percentage']),
  })),
  conditions: z.array(z.string()).optional(),
  expiresAt: z.coerce.date(),
  status: z.enum(['pending', 'accepted', 'rejected', 'expired']),
  createdAt: z.coerce.date(),
});

export type CreditOffer = z.infer<typeof creditOfferSchema>;
