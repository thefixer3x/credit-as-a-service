// Database schema exports for Credit-as-a-Service Platform
// This file consolidates all database schemas for easy importing

// Base schemas - foundational multi-tenant and audit infrastructure
export {
  baseFields,
  tenants,
  organizations,
  auditLogs,
  eventStore
} from './base.js';

// User management schemas - authentication, KYC, and user lifecycle
export {
  users,
  userSessions,
  apiKeys,
  kycDocuments,
  userActivityLogs,
  passwordResetTokens,
  emailVerificationTokens
} from './users.js';

// Credit system schemas - core credit lifecycle management
export {
  creditApplications,
  creditOffers,
  creditLines,
  disbursements,
  repayments,
  creditAssessments,
  paymentSchedules
} from './credit.js';

// Schema collections for easy reference
export const baseSchemas = [
  'tenants',
  'organizations', 
  'auditLogs',
  'eventStore'
] as const;

export const userSchemas = [
  'users',
  'userSessions',
  'apiKeys', 
  'kycDocuments',
  'userActivityLogs',
  'passwordResetTokens',
  'emailVerificationTokens'
] as const;

export const creditSchemas = [
  'creditApplications',
  'creditOffers',
  'creditLines',
  'disbursements', 
  'repayments',
  'creditAssessments',
  'paymentSchedules'
] as const;

export const allSchemas = [
  ...baseSchemas,
  ...userSchemas, 
  ...creditSchemas
] as const;

// Type helpers for schema validation
export type BaseSchema = typeof baseSchemas[number];
export type UserSchema = typeof userSchemas[number];
export type CreditSchema = typeof creditSchemas[number];
export type AllSchema = typeof allSchemas[number];