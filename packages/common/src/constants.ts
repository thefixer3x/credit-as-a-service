// Platform constants

export const CREDIT_SCORE_RANGES = {
  EXCELLENT: { min: 800, max: 850 },
  VERY_GOOD: { min: 740, max: 799 },
  GOOD: { min: 670, max: 739 },
  FAIR: { min: 580, max: 669 },
  POOR: { min: 300, max: 579 },
} as const;

export const LOAN_STATUSES = [
  'pending',
  'approved', 
  'rejected',
  'funded',
  'active',
  'completed',
  'defaulted'
] as const;

export const PAYMENT_STATUSES = [
  'pending',
  'completed',
  'failed',
  'cancelled',
  'refunded'
] as const;

export const USER_ROLES = [
  'user',
  'admin',
  'moderator'
] as const;

export const LOAN_PURPOSES = [
  'personal',
  'business',
  'education',
  'home',
  'auto',
  'debt_consolidation',
  'other'
] as const;

export const PAYMENT_METHODS = [
  'credit_card',
  'bank_transfer',
  'debit_card',
  'check',
  'cash',
  'crypto'
] as const;

// API Configuration
export const API_DEFAULTS = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  RATE_LIMIT_PER_HOUR: 1000,
} as const;

// Validation limits
export const VALIDATION_LIMITS = {
  LOAN_AMOUNT: {
    MIN: 1000,
    MAX: 1000000,
  },
  LOAN_TERM: {
    MIN_MONTHS: 6,
    MAX_MONTHS: 360,
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
  },
  NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
  },
} as const;