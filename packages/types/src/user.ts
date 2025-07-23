import { z } from 'zod';
import { 
  uuidSchema, 
  emailSchema, 
  phoneSchema, 
  addressSchema, 
  auditFieldsSchema, 
  tenantFieldsSchema 
} from './common.js';

// User types
export const UserRole = z.enum(['admin', 'business_owner', 'finance_manager', 'employee', 'customer']);
export const UserStatus = z.enum(['active', 'inactive', 'suspended', 'pending_verification']);
export const VerificationStatus = z.enum(['unverified', 'pending', 'verified', 'rejected']);

// Individual user schema
export const individualUserSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  profilePicture: z.string().url().optional(),
  role: UserRole,
  status: UserStatus,
  address: addressSchema.optional(),
  kycStatus: VerificationStatus,
  twoFactorEnabled: z.boolean().default(false),
  lastLoginAt: z.string().datetime().optional(),
  preferences: z.object({
    language: z.string().default('en'),
    timezone: z.string().default('UTC'),
    currency: z.string().default('USD'),
    notifications: z.object({
      email: z.boolean().default(true),
      sms: z.boolean().default(false),
      push: z.boolean().default(true),
    }).default({}),
  }).default({}),
}).merge(auditFieldsSchema).merge(tenantFieldsSchema);

// Business profile schema
export const businessProfileSchema = z.object({
  id: uuidSchema,
  legalName: z.string().min(1),
  tradingName: z.string().optional(),
  registrationNumber: z.string(),
  taxId: z.string().optional(),
  industry: z.string(),
  businessType: z.enum(['sole_proprietorship', 'partnership', 'llc', 'corporation', 'cooperative']),
  incorporationDate: z.string().date(),
  numberOfEmployees: z.number().min(0).optional(),
  annualRevenue: z.number().min(0).optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  address: addressSchema,
  contactEmail: emailSchema,
  contactPhone: phoneSchema,
  kybStatus: VerificationStatus,
  riskRating: z.enum(['low', 'medium', 'high']).optional(),
  creditRating: z.string().optional(),
  documents: z.array(z.object({
    id: uuidSchema,
    type: z.enum(['certificate_of_incorporation', 'tax_certificate', 'bank_statement', 'financial_statement', 'other']),
    name: z.string(),
    url: z.string().url(),
    status: VerificationStatus,
    uploadedAt: z.string().datetime(),
  })).default([]),
}).merge(auditFieldsSchema).merge(tenantFieldsSchema);

// KYC/KYB verification schemas
export const kycDocumentSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  type: z.enum(['passport', 'national_id', 'drivers_license', 'utility_bill', 'bank_statement']),
  documentNumber: z.string().optional(),
  frontImageUrl: z.string().url(),
  backImageUrl: z.string().url().optional(),
  selfieUrl: z.string().url().optional(),
  status: VerificationStatus,
  reviewNotes: z.string().optional(),
  verifiedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
}).merge(auditFieldsSchema);

export const kybDocumentSchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  type: z.enum(['certificate_of_incorporation', 'articles_of_association', 'tax_certificate', 'memorandum', 'directors_list']),
  documentUrl: z.string().url(),
  status: VerificationStatus,
  reviewNotes: z.string().optional(),
  verifiedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
}).merge(auditFieldsSchema);

// Auth schemas
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  rememberMe: z.boolean().default(false),
  twoFactorToken: z.string().optional(),
});

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: phoneSchema.optional(),
  acceptTerms: z.boolean().refine(val => val === true, 'Must accept terms and conditions'),
});

export const authTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
  user: individualUserSchema.pick({
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    status: true,
  }),
});

// Type exports
export type UserRole = z.infer<typeof UserRole>;
export type UserStatus = z.infer<typeof UserStatus>;
export type VerificationStatus = z.infer<typeof VerificationStatus>;
export type IndividualUser = z.infer<typeof individualUserSchema>;
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
export type KYCDocument = z.infer<typeof kycDocumentSchema>;
export type KYBDocument = z.infer<typeof kybDocumentSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type AuthToken = z.infer<typeof authTokenSchema>;