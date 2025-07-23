import { pgTable, uuid, text, timestamp, boolean, integer, decimal, unique } from 'drizzle-orm/pg-core';
import { baseFields } from './base.js';

// Users table with comprehensive profile and security features
export const users = pgTable('users', {
  ...baseFields,
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  phone: text('phone'),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  middleName: text('middle_name'),
  dateOfBirth: timestamp('date_of_birth'),
  gender: text('gender', { enum: ['male', 'female', 'other', 'prefer_not_to_say'] }),
  profilePicture: text('profile_picture'),
  
  // Authentication and security
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  lastPasswordChange: timestamp('last_password_change'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
  twoFactorSecret: text('two_factor_secret'),
  backupCodes: text('backup_codes'), // JSON array
  
  // Status and permissions
  status: text('status', { 
    enum: ['active', 'inactive', 'suspended', 'pending_verification'] 
  }).default('pending_verification').notNull(),
  role: text('role', { 
    enum: ['admin', 'business_owner', 'finance_manager', 'employee', 'customer'] 
  }).default('customer').notNull(),
  permissions: text('permissions'), // JSON array of permission strings
  
  // KYC information
  kycStatus: text('kyc_status', { 
    enum: ['unverified', 'pending', 'verified', 'rejected'] 
  }).default('unverified').notNull(),
  kycCompletedAt: timestamp('kyc_completed_at'),
  kycExpiresAt: timestamp('kyc_expires_at'),
  
  // Address information
  streetAddress: text('street_address'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  
  // Activity tracking
  lastLoginAt: timestamp('last_login_at'),
  lastActivityAt: timestamp('last_activity_at'),
  loginAttempts: integer('login_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until'),
  
  // User preferences
  language: text('language').default('en').notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  currency: text('currency').default('USD').notNull(),
  emailNotifications: boolean('email_notifications').default(true).notNull(),
  smsNotifications: boolean('sms_notifications').default(false).notNull(),
  pushNotifications: boolean('push_notifications').default(true).notNull(),
  
  // Organization relationship
  organizationId: uuid('organization_id'),
  organizationRole: text('organization_role'),
}, (table) => ({
  uniqueEmailTenant: unique().on(table.email, table.tenantId),
}));

// User sessions for security and device management
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  sessionToken: text('session_token').notNull().unique(),
  refreshToken: text('refresh_token'),
  deviceId: text('device_id'),
  deviceName: text('device_name'),
  deviceType: text('device_type', { enum: ['mobile', 'desktop', 'tablet', 'api'] }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  location: text('location'), // Geo location if available
  isActive: boolean('is_active').default(true).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// API keys for programmatic access
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(), // First 8 chars for identification
  permissions: text('permissions'), // JSON array of permission strings
  ipWhitelist: text('ip_whitelist'), // JSON array of allowed IPs
  rateLimit: integer('rate_limit').default(1000).notNull(), // Requests per hour
  isActive: boolean('is_active').default(true).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// KYC documents and verification
export const kycDocuments = pgTable('kyc_documents', {
  ...baseFields,
  userId: uuid('user_id').notNull(),
  type: text('type', { 
    enum: ['passport', 'national_id', 'drivers_license', 'utility_bill', 'bank_statement'] 
  }).notNull(),
  documentNumber: text('document_number'),
  frontImageUrl: text('front_image_url').notNull(),
  backImageUrl: text('back_image_url'),
  selfieUrl: text('selfie_url'),
  status: text('status', { 
    enum: ['pending', 'approved', 'rejected', 'expired'] 
  }).default('pending').notNull(),
  reviewNotes: text('review_notes'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  verifiedAt: timestamp('verified_at'),
  expiresAt: timestamp('expires_at'),
  
  // AI/ML verification scores
  faceMatchScore: decimal('face_match_score', { precision: 5, scale: 4 }),
  documentQualityScore: decimal('document_quality_score', { precision: 5, scale: 4 }),
  tamperDetectionScore: decimal('tamper_detection_score', { precision: 5, scale: 4 }),
  
  // External verification IDs
  externalReferenceId: text('external_reference_id'),
  providerName: text('provider_name'), // Prembly, SourceID, etc.
});

// User activity logs for security monitoring
export const userActivityLogs = pgTable('user_activity_logs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  action: text('action').notNull(), // login, logout, password_change, etc.
  category: text('category', { 
    enum: ['authentication', 'profile', 'security', 'financial', 'api'] 
  }).notNull(),
  details: text('details'), // JSON with action-specific details
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceId: text('device_id'),
  sessionId: uuid('session_id'),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  
  // Risk scoring
  riskScore: decimal('risk_score', { precision: 5, scale: 4 }),
  riskFactors: text('risk_factors'), // JSON array of risk indicators
});

// Password reset tokens
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Email verification tokens
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verified: boolean('verified').default(false).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});