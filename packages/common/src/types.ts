// Common types used across the platform
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin' | 'moderator';
  isActive: boolean;
  isVerified: boolean;
  creditScore?: number;
}

export interface Loan extends BaseEntity {
  userId: string;
  amount: number;
  purpose: 'personal' | 'business' | 'education' | 'home' | 'auto' | 'debt_consolidation' | 'other';
  termMonths: number;
  status: 'pending' | 'approved' | 'rejected' | 'funded' | 'active' | 'completed' | 'defaulted';
  approvedAmount?: number;
  approvedRate?: number;
  approvedTermMonths?: number;
}

export interface Payment extends BaseEntity {
  userId: string;
  loanId: string;
  amount: number;
  paymentMethod: 'credit_card' | 'bank_transfer' | 'debit_card' | 'check' | 'cash' | 'crypto';
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  paymentType: 'regular' | 'partial' | 'early' | 'late' | 'refund';
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface APIError {
  error: string;
  message: string;
  details?: any;
}

// Credit scoring types
export interface CreditAssessment {
  creditScore: number;
  riskRating: 'low' | 'medium' | 'high';
  recommendedLimit: number;
  interestRate: number;
  debtToIncomeRatio: number;
  employmentVerification: boolean;
}

// Permission types
export type CreditPermissions = 
  | 'credit:application:create'
  | 'credit:application:approve'
  | 'credit:disbursement:execute'
  | 'credit:collection:manage'
  | 'users:manage'
  | 'admin:dashboard'
  | 'api:keys:manage';

export interface ExtendedJWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  creditPermissions?: CreditPermissions[];
  creditLimit?: number;
  riskRating?: 'low' | 'medium' | 'high';
}