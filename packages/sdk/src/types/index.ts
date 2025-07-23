import { z } from 'zod';

// Base API Response Schema
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }).optional(),
  timestamp: z.string(),
  requestId: z.string(),
});

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  requestId: string;
};

// SDK Configuration
export const SdkConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().url().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  timeout: z.number().min(1000).max(60000).default(30000),
  retryAttempts: z.number().min(0).max(5).default(3),
  retryDelay: z.number().min(100).max(5000).default(1000),
  rateLimitPerHour: z.number().min(1).default(1000),
});

export type SdkConfig = z.infer<typeof SdkConfigSchema>;

// User Management Types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
  kycStatus: z.enum(['not_started', 'pending', 'approved', 'rejected']),
});

export type User = z.infer<typeof UserSchema>;

// Credit Application Types
export const CreditApplicationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  requestedAmount: z.number().positive(),
  purpose: z.string(),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected']),
  creditScore: z.number().min(300).max(850).optional(),
  approvedAmount: z.number().positive().optional(),
  interestRate: z.number().min(0).max(100).optional(),
  termMonths: z.number().positive().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreditApplication = z.infer<typeof CreditApplicationSchema>;

// Loan Types
export const LoanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  applicationId: z.string(),
  principalAmount: z.number().positive(),
  outstandingBalance: z.number().min(0),
  interestRate: z.number().min(0).max(100),
  termMonths: z.number().positive(),
  paymentFrequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly']),
  nextPaymentDate: z.string(),
  nextPaymentAmount: z.number().positive(),
  status: z.enum(['active', 'completed', 'defaulted', 'cancelled']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Loan = z.infer<typeof LoanSchema>;

// Payment Types
export const PaymentSchema = z.object({
  id: z.string(),
  loanId: z.string(),
  amount: z.number().positive(),
  principalAmount: z.number().min(0),
  interestAmount: z.number().min(0),
  dueDate: z.string(),
  paidDate: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']),
  paymentMethod: z.enum(['bank_transfer', 'card', 'wallet', 'auto_debit']),
  transactionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Payment = z.infer<typeof PaymentSchema>;

// Transaction Types
export const TransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(['credit', 'debit']),
  category: z.enum(['disbursement', 'repayment', 'fee', 'refund']),
  amount: z.number().positive(),
  currency: z.string().length(3),
  description: z.string(),
  reference: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// KYC/Onboarding Types
export const OnboardingApplicationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(['individual', 'business']),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected']),
  currentStep: z.string(),
  completedSteps: z.array(z.string()),
  personalInfo: z.object({
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string(),
    nationality: z.string(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      postalCode: z.string(),
    }),
  }).optional(),
  businessInfo: z.object({
    name: z.string(),
    registrationNumber: z.string(),
    industry: z.string(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      postalCode: z.string(),
    }),
  }).optional(),
  documents: z.array(z.object({
    id: z.string(),
    type: z.string(),
    url: z.string(),
    status: z.enum(['uploaded', 'verified', 'rejected']),
    uploadedAt: z.string(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OnboardingApplication = z.infer<typeof OnboardingApplicationSchema>;

// API Method Parameters
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: any;
}

// Error Types
export class CaasError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'CaasError';
  }
}

export class CaasAuthError extends CaasError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', null, 401);
    this.name = 'CaasAuthError';
  }
}

export class CaasRateLimitError extends CaasError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', null, 429);
    this.name = 'CaasRateLimitError';
  }
}

export class CaasValidationError extends CaasError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details, 400);
    this.name = 'CaasValidationError';
  }
}

// Event Types
export interface SdkEvents {
  'request:start': { method: string; url: string; data?: any };
  'request:success': { method: string; url: string; data: any; duration: number };
  'request:error': { method: string; url: string; error: CaasError; duration: number };
  'auth:expired': { timestamp: string };
  'rate:limit': { resetTime: number };
}