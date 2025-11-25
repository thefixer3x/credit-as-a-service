import { pgTable, serial, varchar, text, integer, boolean, timestamp, decimal, jsonb, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  dateOfBirth: timestamp('date_of_birth'),
  socialSecurityNumber: varchar('ssn', { length: 11 }), // Encrypted
  address: jsonb('address').$type<{
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  }>(),
  employmentInfo: jsonb('employment_info').$type<{
    employer: string;
    position: string;
    annualIncome: number;
    employmentType: 'full_time' | 'part_time' | 'contract' | 'self_employed' | 'unemployed';
    yearsAtJob: number;
  }>(),
  creditScore: integer('credit_score'),
  isVerified: boolean('is_verified').default(false),
  isActive: boolean('is_active').default(true),
  role: varchar('role', { length: 20 }).default('user'), // user, admin, super_admin
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    creditScoreIdx: index('users_credit_score_idx').on(table.creditScore),
    roleIdx: index('users_role_idx').on(table.role),
  };
});

// Loan applications table
export const loanApplications = pgTable('loan_applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  applicationNumber: varchar('application_number', { length: 50 }).notNull().unique(),
  loanType: varchar('loan_type', { length: 50 }).notNull(), // personal, auto, mortgage, business
  requestedAmount: decimal('requested_amount', { precision: 12, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(), // Alias for requestedAmount for backward compatibility
  approvedAmount: decimal('approved_amount', { precision: 12, scale: 2 }),
  interestRate: decimal('interest_rate', { precision: 5, scale: 4 }),
  termMonths: integer('term_months').notNull(),
  purpose: varchar('purpose', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending'), // pending, approved, rejected, cancelled
  creditScore: integer('credit_score'),
  estimatedRate: decimal('estimated_rate', { precision: 5, scale: 4 }),
  approvedRate: decimal('approved_rate', { precision: 5, scale: 4 }),
  approvedTermMonths: integer('approved_term_months'),
  annualIncome: decimal('annual_income', { precision: 12, scale: 2 }),
  employmentStatus: varchar('employment_status', { length: 50 }),
  collateralValue: decimal('collateral_value', { precision: 12, scale: 2 }),
  collateralType: varchar('collateral_type', { length: 50 }),
  debtToIncomeRatio: decimal('debt_to_income_ratio', { precision: 5, scale: 4 }),
  monthlyDebtPayments: decimal('monthly_debt_payments', { precision: 10, scale: 2 }),
  description: text('description'),
  adminNotes: text('admin_notes'),
  riskAssessment: jsonb('risk_assessment').$type<{
    score: number;
    factors: string[];
    recommendation: 'approve' | 'reject' | 'manual_review';
    confidence: number;
  }>(),
  documents: jsonb('documents').$type<{
    id: string;
    name: string;
    type: string;
    url: string;
    verified: boolean;
  }[]>(),
  applicationData: jsonb('application_data'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('loan_applications_user_id_idx').on(table.userId),
    statusIdx: index('loan_applications_status_idx').on(table.status),
    applicationNumberIdx: uniqueIndex('loan_applications_number_idx').on(table.applicationNumber),
    loanTypeIdx: index('loan_applications_type_idx').on(table.loanType),
  };
});

// Loans table (approved applications)
export const loans = pgTable('loans', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: uuid('application_id').references(() => loanApplications.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  loanNumber: varchar('loan_number', { length: 50 }).notNull().unique(),
  principalAmount: decimal('principal_amount', { precision: 12, scale: 2 }).notNull(),
  currentBalance: decimal('current_balance', { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 4 }).notNull(),
  termMonths: integer('term_months').notNull(),
  monthlyPayment: decimal('monthly_payment', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).default('active'), // active, paid_off, defaulted, charged_off
  disbursedAt: timestamp('disbursed_at'),
  maturityDate: timestamp('maturity_date').notNull(),
  nextPaymentDate: timestamp('next_payment_date'),
  paymentsMade: integer('payments_made').default(0),
  totalPayments: integer('total_payments').notNull(),
  latePaymentCount: integer('late_payment_count').default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('loans_user_id_idx').on(table.userId),
    statusIdx: index('loans_status_idx').on(table.status),
    loanNumberIdx: uniqueIndex('loans_number_idx').on(table.loanNumber),
    nextPaymentIdx: index('loans_next_payment_idx').on(table.nextPaymentDate),
  };
});

// Payments table
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  loanId: uuid('loan_id').references(() => loans.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  paymentNumber: varchar('payment_number', { length: 50 }).notNull().unique(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  principalAmount: decimal('principal_amount', { precision: 10, scale: 2 }).notNull(),
  interestAmount: decimal('interest_amount', { precision: 10, scale: 2 }).notNull(),
  feesAmount: decimal('fees_amount', { precision: 10, scale: 2 }).default('0'),
  expectedAmount: decimal('expected_amount', { precision: 10, scale: 2 }),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(), // ach, card, wire, check
  paymentType: varchar('payment_type', { length: 20 }), // scheduled, manual, autopay
  paymentReference: varchar('payment_reference', { length: 100 }),
  transactionId: varchar('transaction_id', { length: 100 }),
  status: varchar('status', { length: 20 }).default('pending'), // pending, completed, failed, refunded
  scheduledDate: timestamp('scheduled_date').notNull(),
  dueDate: timestamp('due_date'),
  processedDate: timestamp('processed_date'),
  processedAt: timestamp('processed_at'), // Alias for processedDate
  failureReason: text('failure_reason'),
  processorResponse: text('processor_response'),
  notes: text('notes'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    loanIdIdx: index('payments_loan_id_idx').on(table.loanId),
    userIdIdx: index('payments_user_id_idx').on(table.userId),
    statusIdx: index('payments_status_idx').on(table.status),
    scheduledDateIdx: index('payments_scheduled_date_idx').on(table.scheduledDate),
    paymentNumberIdx: uniqueIndex('payments_number_idx').on(table.paymentNumber),
  };
});

// Credit reports table
export const creditReports = pgTable('credit_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  reportType: varchar('report_type', { length: 20 }).notNull(), // experian, equifax, transunion
  creditScore: integer('credit_score').notNull(),
  reportData: jsonb('report_data').$type<{
    accounts: any[];
    inquiries: any[];
    publicRecords: any[];
    personalInfo: any;
  }>(),
  rawResponse: jsonb('raw_response'),
  isActive: boolean('is_active').default(true),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('credit_reports_user_id_idx').on(table.userId),
    reportTypeIdx: index('credit_reports_type_idx').on(table.reportType),
    isActiveIdx: index('credit_reports_active_idx').on(table.isActive),
  };
});

// System logs table
export const systemLogs = pgTable('system_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  level: varchar('level', { length: 10 }).notNull(), // info, warn, error, debug
  message: text('message').notNull(),
  service: varchar('service', { length: 50 }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  sessionId: varchar('session_id', { length: 100 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  requestId: varchar('request_id', { length: 100 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    levelIdx: index('system_logs_level_idx').on(table.level),
    serviceIdx: index('system_logs_service_idx').on(table.service),
    userIdIdx: index('system_logs_user_id_idx').on(table.userId),
    createdAtIdx: index('system_logs_created_at_idx').on(table.createdAt),
  };
});

// API keys table
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 10 }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  permissions: jsonb('permissions').$type<string[]>(),
  rateLimitRpm: integer('rate_limit_rpm').default(1000),
  isActive: boolean('is_active').default(true),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => {
  return {
    keyHashIdx: uniqueIndex('api_keys_hash_idx').on(table.keyHash),
    userIdIdx: index('api_keys_user_id_idx').on(table.userId),
    isActiveIdx: index('api_keys_active_idx').on(table.isActive),
  };
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  loanApplications: many(loanApplications),
  loans: many(loans),
  payments: many(payments),
  creditReports: many(creditReports),
  systemLogs: many(systemLogs),
  apiKeys: many(apiKeys),
}));

export const loanApplicationsRelations = relations(loanApplications, ({ one, many }) => ({
  user: one(users, {
    fields: [loanApplications.userId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [loanApplications.reviewedBy],
    references: [users.id],
  }),
  loan: one(loans),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  application: one(loanApplications, {
    fields: [loans.applicationId],
    references: [loanApplications.id],
  }),
  user: one(users, {
    fields: [loans.userId],
    references: [users.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  loan: one(loans, {
    fields: [payments.loanId],
    references: [loans.id],
  }),
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const creditReportsRelations = relations(creditReports, ({ one }) => ({
  user: one(users, {
    fields: [creditReports.userId],
    references: [users.id],
  }),
}));

export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
  user: one(users, {
    fields: [systemLogs.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));