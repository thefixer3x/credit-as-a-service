import { z } from 'zod';

// Base schemas
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email();
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);
export const timestampSchema = z.string().datetime();

// Common enums
export const CurrencyCode = z.enum(['USD', 'EUR', 'GBP', 'NGN', 'KES', 'ZAR', 'GHS']);
export const CountryCode = z.enum(['US', 'GB', 'DE', 'NG', 'KE', 'ZA', 'GH']);
export const LanguageCode = z.enum(['en', 'fr', 'de', 'es', 'pt', 'sw', 'ha', 'yo', 'ig']);

// API Response wrapper
export const apiResponseSchema = <T>(dataSchema: z.ZodType<T>) => z.object({
  success: z.boolean(),
  data: dataSchema.optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
  }).optional(),
  meta: z.object({
    timestamp: timestampSchema,
    requestId: uuidSchema,
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }).optional(),
  }),
});

// Pagination
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Address
export const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: CountryCode,
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
});

// Money amount
export const moneySchema = z.object({
  amount: z.number().multipleOf(0.01),
  currency: CurrencyCode,
});

// Audit fields
export const auditFieldsSchema = z.object({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdBy: uuidSchema.optional(),
  updatedBy: uuidSchema.optional(),
  version: z.number().default(1),
});

// Multi-tenant fields
export const tenantFieldsSchema = z.object({
  tenantId: uuidSchema,
  organizationId: uuidSchema.optional(),
});

export type UUID = z.infer<typeof uuidSchema>;
export type Email = z.infer<typeof emailSchema>;
export type Phone = z.infer<typeof phoneSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
export type CurrencyCode = z.infer<typeof CurrencyCode>;
export type CountryCode = z.infer<typeof CountryCode>;
export type LanguageCode = z.infer<typeof LanguageCode>;
export type ApiResponse<T> = z.infer<ReturnType<typeof apiResponseSchema<T>>>;
export type Pagination = z.infer<typeof paginationSchema>;
export type Address = z.infer<typeof addressSchema>;
export type Money = z.infer<typeof moneySchema>;
export type AuditFields = z.infer<typeof auditFieldsSchema>;
export type TenantFields = z.infer<typeof tenantFieldsSchema>;