import { z } from 'zod';

// Authentication request schemas
export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional().default(false),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

export const registrationSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  acceptTerms: z.boolean().refine(val => val === true, 'Terms must be accepted'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
});

export const twoFactorSetupSchema = z.object({
  secret: z.string(),
  token: z.string().length(6, 'Token must be 6 digits'),
});

export const twoFactorVerifySchema = z.object({
  token: z.string().length(6, 'Token must be 6 digits'),
  backupCode: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// JWT payload interfaces
export interface JWTPayload {
  sub: string; // user ID
  email: string;
  tenantId: string;
  role: string;
  permissions: string[];
  sessionId: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  
  // Credit-specific claims
  creditPermissions?: string[];
  creditLimit?: number;
  riskRating?: 'low' | 'medium' | 'high';
  kycStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  tokenFamily: string;
  exp: number;
  iat: number;
}

// Authentication response interfaces
export interface AuthenticationResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    kycStatus: string;
    lastLoginAt: Date | null;
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  session?: {
    id: string;
    deviceName?: string;
    expiresAt: Date;
  };
  requiresTwoFactor?: boolean;
  tempSessionId?: string;
  error?: string;
  errorCode?: string;
}

export interface RegistrationResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  verificationRequired?: boolean;
  error?: string;
  errorCode?: string;
}

export interface TwoFactorSetupResult {
  success: boolean;
  secret?: string;
  qrCodeUrl?: string;
  backupCodes?: string[];
  error?: string;
}

// Session interfaces
export interface SessionData {
  id: string;
  userId: string;
  tenantId: string;
  deviceId?: string;
  deviceName?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'api';
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  isActive: boolean;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'api';
  userAgent?: string;
  ipAddress?: string;
  location?: string;
}

// Permission and role interfaces
export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  name: string;
  permissions: Permission[];
  description?: string;
}

// Credit-specific permission types
export type CreditPermission = 
  | 'credit:application:create'
  | 'credit:application:view'
  | 'credit:application:approve'
  | 'credit:application:reject'
  | 'credit:disbursement:execute'
  | 'credit:disbursement:view'
  | 'credit:repayment:process'
  | 'credit:repayment:view'
  | 'credit:collection:manage'
  | 'credit:collection:view'
  | 'credit:reports:view'
  | 'credit:admin:all';

// API key interfaces
export interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  ipWhitelist?: string[];
  rateLimit: number;
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: string[];
  ipWhitelist?: string[];
  rateLimit?: number;
  expiresAt?: Date;
}

// Audit and security interfaces
export interface SecurityEvent {
  type: 'login' | 'logout' | 'login_failed' | 'password_change' | 'two_factor_enabled' | 'two_factor_disabled' | 'api_key_created' | 'api_key_revoked';
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  riskScore?: number;
  timestamp: Date;
}

export interface RiskAssessment {
  score: number; // 0-1 scale
  factors: string[];
  recommendation: 'allow' | 'challenge' | 'block';
  metadata?: Record<string, any>;
}

// Type exports
export type LoginRequest = z.infer<typeof loginSchema>;
export type RegistrationRequest = z.infer<typeof registrationSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;
export type TwoFactorSetup = z.infer<typeof twoFactorSetupSchema>;
export type TwoFactorVerify = z.infer<typeof twoFactorVerifySchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;