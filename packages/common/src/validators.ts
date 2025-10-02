import { z } from 'zod';
import { VALIDATION_LIMITS, LOAN_STATUSES, PAYMENT_STATUSES, USER_ROLES, LOAN_PURPOSES, PAYMENT_METHODS } from './constants';

// Common validation schemas used across the platform

export const emailSchema = z.string().email('Invalid email format');

export const passwordSchema = z
  .string()
  .min(VALIDATION_LIMITS.PASSWORD.MIN_LENGTH, `Password must be at least ${VALIDATION_LIMITS.PASSWORD.MIN_LENGTH} characters`)
  .max(VALIDATION_LIMITS.PASSWORD.MAX_LENGTH, `Password must be no more than ${VALIDATION_LIMITS.PASSWORD.MAX_LENGTH} characters`);

export const nameSchema = z
  .string()
  .min(VALIDATION_LIMITS.NAME.MIN_LENGTH, 'Name is required')
  .max(VALIDATION_LIMITS.NAME.MAX_LENGTH, `Name must be no more than ${VALIDATION_LIMITS.NAME.MAX_LENGTH} characters`);

export const userRoleSchema = z.enum(USER_ROLES);

export const loanStatusSchema = z.enum(LOAN_STATUSES);

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const loanPurposeSchema = z.enum(LOAN_PURPOSES);

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const loanAmountSchema = z
  .number()
  .min(VALIDATION_LIMITS.LOAN_AMOUNT.MIN, `Loan amount must be at least $${VALIDATION_LIMITS.LOAN_AMOUNT.MIN.toLocaleString()}`)
  .max(VALIDATION_LIMITS.LOAN_AMOUNT.MAX, `Loan amount must be no more than $${VALIDATION_LIMITS.LOAN_AMOUNT.MAX.toLocaleString()}`);

export const loanTermSchema = z
  .number()
  .min(VALIDATION_LIMITS.LOAN_TERM.MIN_MONTHS, `Loan term must be at least ${VALIDATION_LIMITS.LOAN_TERM.MIN_MONTHS} months`)
  .max(VALIDATION_LIMITS.LOAN_TERM.MAX_MONTHS, `Loan term must be no more than ${VALIDATION_LIMITS.LOAN_TERM.MAX_MONTHS} months`);

export const creditScoreSchema = z
  .number()
  .min(300, 'Credit score must be at least 300')
  .max(850, 'Credit score must be no more than 850')
  .optional();

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  page: z.number().min(1, 'Page must be at least 1').default(1),
  limit: z.number().min(1, 'Limit must be at least 1').max(100, 'Limit must be no more than 100').default(20),
});

// Complex schemas
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: z.string().optional(),
  role: userRoleSchema.optional().default('user'),
});

export const createLoanSchema = z.object({
  amount: loanAmountSchema,
  purpose: loanPurposeSchema,
  termMonths: loanTermSchema,
  annualIncome: z.number().min(0, 'Annual income must be non-negative'),
  employmentStatus: z.enum(['employed', 'self_employed', 'unemployed', 'retired', 'student']),
  monthlyDebtPayments: z.number().min(0, 'Monthly debt payments must be non-negative').optional().default(0),
  collateralValue: z.number().min(0, 'Collateral value must be non-negative').optional(),
  collateralType: z.enum(['real_estate', 'vehicle', 'savings', 'securities', 'other', 'none']).optional().default('none'),
  description: z.string().max(1000, 'Description must be no more than 1000 characters').optional(),
});

export const createPaymentSchema = z.object({
  loanId: uuidSchema,
  amount: z.number().min(0.01, 'Payment amount must be at least $0.01').max(100000, 'Payment amount must be no more than $100,000'),
  paymentMethod: paymentMethodSchema,
  paymentReference: z.string().optional(),
  notes: z.string().max(500, 'Notes must be no more than 500 characters').optional(),
});