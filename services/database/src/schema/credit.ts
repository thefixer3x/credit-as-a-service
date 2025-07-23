import { pgTable, uuid, text, timestamp, boolean, integer, decimal, unique, index } from 'drizzle-orm/pg-core';
import { baseFields } from './base.js';

// Credit applications - main entry point for credit requests
export const creditApplications = pgTable('caas_credit_applications', {
  ...baseFields,
  userId: uuid('user_id').notNull(),
  organizationId: uuid('organization_id'),
  
  // Application details
  applicationNumber: text('application_number').notNull().unique(),
  requestedAmount: decimal('requested_amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  purpose: text('purpose').notNull(),
  description: text('description'),
  
  // Status tracking
  status: text('status', {
    enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn']
  }).default('draft').notNull(),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: uuid('reviewed_by'),
  
  // Underwriting results
  riskScore: decimal('risk_score', { precision: 5, scale: 4 }),
  riskGrade: text('risk_grade', { enum: ['A', 'B', 'C', 'D', 'E'] }),
  approvedAmount: decimal('approved_amount', { precision: 15, scale: 2 }),
  interestRate: decimal('interest_rate', { precision: 5, scale: 4 }),
  termMonths: integer('term_months'),
  
  // Documents and verification
  requiredDocuments: text('required_documents'), // JSON array
  submittedDocuments: text('submitted_documents'), // JSON array
  verificationStatus: text('verification_status', {
    enum: ['pending', 'in_progress', 'completed', 'failed']
  }).default('pending').notNull(),
  
  // Integration references
  smeUserId: text('sme_user_id'),
  externalReferenceId: text('external_reference_id'),
  
  // Metadata
  applicationSource: text('application_source', {
    enum: ['web', 'mobile', 'api', 'partner']
  }).default('web').notNull(),
  metadata: text('metadata'), // JSON
}, (table) => ({
  userApplicationsIdx: index('idx_credit_applications_user_id').on(table.userId),
  statusIdx: index('idx_credit_applications_status').on(table.status),
  submittedAtIdx: index('idx_credit_applications_submitted_at').on(table.submittedAt),
}));

// Credit offers - approved credit lines available to users
export const creditOffers = pgTable('caas_credit_offers', {
  ...baseFields,
  applicationId: uuid('application_id').notNull(),
  userId: uuid('user_id').notNull(),
  
  // Offer details
  offerNumber: text('offer_number').notNull().unique(),
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 4 }).notNull(),
  termMonths: integer('term_months').notNull(),
  currency: text('currency').default('USD').notNull(),
  
  // Pricing and fees
  originationFee: decimal('origination_fee', { precision: 15, scale: 2 }).default('0').notNull(),
  monthlyFee: decimal('monthly_fee', { precision: 15, scale: 2 }).default('0').notNull(),
  lateFee: decimal('late_fee', { precision: 15, scale: 2 }).default('0').notNull(),
  overLimitFee: decimal('over_limit_fee', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Status and validity
  status: text('status', {
    enum: ['active', 'pending_acceptance', 'expired', 'cancelled', 'utilized']
  }).default('pending_acceptance').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  
  // Risk and compliance
  riskTier: text('risk_tier', { enum: ['prime', 'near_prime', 'subprime'] }).notNull(),
  complianceChecks: text('compliance_checks'), // JSON
  
  // Smart contract integration
  blockchainTxHash: text('blockchain_tx_hash'),
  contractAddress: text('contract_address'),
  tokenId: text('token_id'), // For NFT representation
}, (table) => ({
  userOffersIdx: index('idx_credit_offers_user_id').on(table.userId),
  statusIdx: index('idx_credit_offers_status').on(table.status),
  expiresAtIdx: index('idx_credit_offers_expires_at').on(table.expiresAt),
}));

// Credit lines - active credit facilities
export const creditLines = pgTable('caas_credit_lines', {
  ...baseFields,
  offerId: uuid('offer_id').notNull(),
  userId: uuid('user_id').notNull(),
  
  // Credit line details
  lineNumber: text('line_number').notNull().unique(),
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }).notNull(),
  availableCredit: decimal('available_credit', { precision: 15, scale: 2 }).notNull(),
  utilizationAmount: decimal('utilization_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 4 }).notNull(),
  
  // Status and dates
  status: text('status', {
    enum: ['active', 'frozen', 'suspended', 'closed', 'defaulted']
  }).default('active').notNull(),
  activatedAt: timestamp('activated_at').defaultNow().notNull(),
  maturityDate: timestamp('maturity_date').notNull(),
  lastPaymentDate: timestamp('last_payment_date'),
  nextPaymentDue: timestamp('next_payment_due'),
  
  // Payment terms
  minimumPaymentAmount: decimal('minimum_payment_amount', { precision: 15, scale: 2 }),
  paymentDayOfMonth: integer('payment_day_of_month').default(1).notNull(),
  gracePeriodDays: integer('grace_period_days').default(5).notNull(),
  
  // Balances and accruals
  principalBalance: decimal('principal_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  interestBalance: decimal('interest_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  feesBalance: decimal('fees_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  totalBalance: decimal('total_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Risk monitoring
  daysPastDue: integer('days_past_due').default(0).notNull(),
  delinquencyStatus: text('delinquency_status', {
    enum: ['current', 'late_1_30', 'late_31_60', 'late_61_90', 'late_90_plus', 'charged_off']
  }).default('current').notNull(),
  
  // Smart contract references
  blockchainAddress: text('blockchain_address'),
  contractVersion: text('contract_version'),
}, (table) => ({
  userLinesIdx: index('idx_credit_lines_user_id').on(table.userId),
  statusIdx: index('idx_credit_lines_status').on(table.status),
  maturityIdx: index('idx_credit_lines_maturity_date').on(table.maturityDate),
  paymentDueIdx: index('idx_credit_lines_next_payment_due').on(table.nextPaymentDue),
}));

// Disbursements - actual fund transfers to users
export const disbursements = pgTable('caas_disbursements', {
  ...baseFields,
  creditLineId: uuid('credit_line_id').notNull(),
  userId: uuid('user_id').notNull(),
  
  // Disbursement details
  disbursementNumber: text('disbursement_number').notNull().unique(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  purpose: text('purpose').notNull(),
  
  // Status tracking
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed']
  }).default('pending').notNull(),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
  
  // Payment details
  paymentMethod: text('payment_method', {
    enum: ['bank_transfer', 'virtual_account', 'mobile_wallet', 'debit_card']
  }).notNull(),
  paymentAccountId: uuid('payment_account_id'),
  externalTransactionId: text('external_transaction_id'),
  providerName: text('provider_name'),
  
  // Recipient details
  recipientName: text('recipient_name').notNull(),
  recipientAccount: text('recipient_account').notNull(),
  recipientBank: text('recipient_bank'),
  recipientAddress: text('recipient_address'), // JSON
  
  // Fees and charges
  disbursementFee: decimal('disbursement_fee', { precision: 15, scale: 2 }).default('0').notNull(),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 6 }),
  
  // Integration references
  smeTransactionId: text('sme_transaction_id'),
  blockchainTxHash: text('blockchain_tx_hash'),
  
  // Error handling
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').default(0).notNull(),
  metadata: text('metadata'), // JSON
}, (table) => ({
  creditLineIdx: index('idx_disbursements_credit_line_id').on(table.creditLineId),
  userIdx: index('idx_disbursements_user_id').on(table.userId),
  statusIdx: index('idx_disbursements_status').on(table.status),
  requestedAtIdx: index('idx_disbursements_requested_at').on(table.requestedAt),
}));

// Repayments - payments made towards credit lines
export const repayments = pgTable('caas_repayments', {
  ...baseFields,
  creditLineId: uuid('credit_line_id').notNull(),
  userId: uuid('user_id').notNull(),
  
  // Repayment details
  repaymentNumber: text('repayment_number').notNull().unique(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  
  // Payment breakdown
  principalAmount: decimal('principal_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  interestAmount: decimal('interest_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  feesAmount: decimal('fees_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  penaltyAmount: decimal('penalty_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Status and timing
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'partial']
  }).default('pending').notNull(),
  scheduledDate: timestamp('scheduled_date'),
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
  
  // Payment source
  paymentMethod: text('payment_method', {
    enum: ['auto_debit', 'bank_transfer', 'card_payment', 'mobile_wallet', 'cash', 'check']
  }).notNull(),
  paymentAccountId: uuid('payment_account_id'),
  externalTransactionId: text('external_transaction_id'),
  
  // Classification
  repaymentType: text('repayment_type', {
    enum: ['scheduled', 'early', 'minimum', 'full', 'overpayment', 'recovery']
  }).notNull(),
  isAutomatic: boolean('is_automatic').default(false).notNull(),
  
  // Integration references
  smeTransactionId: text('sme_transaction_id'),
  blockchainTxHash: text('blockchain_tx_hash'),
  
  // Error handling
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').default(0).notNull(),
  metadata: text('metadata'), // JSON
}, (table) => ({
  creditLineIdx: index('idx_repayments_credit_line_id').on(table.creditLineId),
  userIdx: index('idx_repayments_user_id').on(table.userId),
  statusIdx: index('idx_repayments_status').on(table.status),
  scheduledDateIdx: index('idx_repayments_scheduled_date').on(table.scheduledDate),
  completedAtIdx: index('idx_repayments_completed_at').on(table.completedAt),
}));

// Credit assessments - underwriting and risk evaluation results
export const creditAssessments = pgTable('caas_credit_assessments', {
  ...baseFields,
  applicationId: uuid('application_id'),
  userId: uuid('user_id').notNull(),
  
  // Assessment details
  assessmentType: text('assessment_type', {
    enum: ['pre_qualification', 'full_underwriting', 'periodic_review', 'collection_review']
  }).notNull(),
  assessmentNumber: text('assessment_number').notNull().unique(),
  
  // Scoring results
  creditScore: integer('credit_score'),
  creditScoreProvider: text('credit_score_provider'),
  riskScore: decimal('risk_score', { precision: 5, scale: 4 }),
  riskGrade: text('risk_grade', { enum: ['A', 'B', 'C', 'D', 'E'] }),
  probabilityOfDefault: decimal('probability_of_default', { precision: 5, scale: 4 }),
  
  // Financial analysis
  debtToIncomeRatio: decimal('debt_to_income_ratio', { precision: 5, scale: 4 }),
  monthlyIncome: decimal('monthly_income', { precision: 15, scale: 2 }),
  monthlyExpenses: decimal('monthly_expenses', { precision: 15, scale: 2 }),
  netWorth: decimal('net_worth', { precision: 15, scale: 2 }),
  cashFlow: decimal('cash_flow', { precision: 15, scale: 2 }),
  
  // Risk factors
  riskFactors: text('risk_factors'), // JSON array
  positiveFactors: text('positive_factors'), // JSON array
  warningFlags: text('warning_flags'), // JSON array
  
  // Recommendation
  recommendation: text('recommendation', {
    enum: ['approve', 'approve_with_conditions', 'reject', 'refer_for_manual_review']
  }).notNull(),
  recommendedAmount: decimal('recommended_amount', { precision: 15, scale: 2 }),
  recommendedRate: decimal('recommended_rate', { precision: 5, scale: 4 }),
  recommendedTerm: integer('recommended_term'),
  
  // Processing details
  assessedBy: text('assessed_by', { enum: ['system', 'underwriter', 'ai_model'] }).notNull(),
  assessorId: uuid('assessor_id'),
  modelVersion: text('model_version'),
  processingTimeMs: integer('processing_time_ms'),
  
  // External data sources
  bureauData: text('bureau_data'), // JSON
  bankStatementAnalysis: text('bank_statement_analysis'), // JSON
  socialMediaAnalysis: text('social_media_analysis'), // JSON
  deviceFingerprint: text('device_fingerprint'), // JSON
  
  // Status
  status: text('status', {
    enum: ['pending', 'in_progress', 'completed', 'failed', 'expired']
  }).default('pending').notNull(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at'),
  
  // Compliance and audit
  complianceChecks: text('compliance_checks'), // JSON
  auditTrail: text('audit_trail'), // JSON
  metadata: text('metadata'), // JSON
}, (table) => ({
  userIdx: index('idx_credit_assessments_user_id').on(table.userId),
  applicationIdx: index('idx_credit_assessments_application_id').on(table.applicationId),
  statusIdx: index('idx_credit_assessments_status').on(table.status),
  recommendationIdx: index('idx_credit_assessments_recommendation').on(table.recommendation),
}));

// Payment schedules - scheduled payment dates and amounts
export const paymentSchedules = pgTable('caas_payment_schedules', {
  ...baseFields,
  creditLineId: uuid('credit_line_id').notNull(),
  
  // Schedule details
  scheduleNumber: integer('schedule_number').notNull(), // 1, 2, 3, etc.
  dueDate: timestamp('due_date').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  
  // Payment breakdown
  principalAmount: decimal('principal_amount', { precision: 15, scale: 2 }).notNull(),
  interestAmount: decimal('interest_amount', { precision: 15, scale: 2 }).notNull(),
  feesAmount: decimal('fees_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Status tracking
  status: text('status', {
    enum: ['upcoming', 'due', 'overdue', 'paid', 'partially_paid', 'skipped', 'rescheduled']
  }).default('upcoming').notNull(),
  paidAmount: decimal('paid_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  paidDate: timestamp('paid_date'),
  
  // Outstanding balances
  outstandingPrincipal: decimal('outstanding_principal', { precision: 15, scale: 2 }).notNull(),
  outstandingInterest: decimal('outstanding_interest', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Automation
  autoPayEnabled: boolean('auto_pay_enabled').default(false).notNull(),
  autoPayAttempted: boolean('auto_pay_attempted').default(false).notNull(),
  autoPayFailureReason: text('auto_pay_failure_reason'),
  
  // Notifications
  remindersSent: integer('reminders_sent').default(0).notNull(),
  lastReminderSent: timestamp('last_reminder_sent'),
  
  // Modifications
  originalDueDate: timestamp('original_due_date'),
  rescheduleReason: text('reschedule_reason'),
  rescheduleCount: integer('reschedule_count').default(0).notNull(),
}, (table) => ({
  creditLineScheduleIdx: unique().on(table.creditLineId, table.scheduleNumber),
  dueDateIdx: index('idx_payment_schedules_due_date').on(table.dueDate),
  statusIdx: index('idx_payment_schedules_status').on(table.status),
  autoPayIdx: index('idx_payment_schedules_auto_pay').on(table.autoPayEnabled),
}));