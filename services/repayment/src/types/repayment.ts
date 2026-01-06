export interface RepaymentSchedule {
  id: string;
  creditApplicationId: string;
  userId: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  paymentFrequency: 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly';
  startDate: Date;
  endDate: Date;
  totalAmount: number;
  totalInterest: number;
  payments: ScheduledPayment[];
  status: 'active' | 'completed' | 'defaulted' | 'cancelled';
  gracePeriodDays: number;
  lateFeePercentage: number;
  compoundingType: 'simple' | 'compound';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledPayment {
  id: string;
  scheduleId: string;
  paymentNumber: number;
  dueDate: Date;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  remainingPrincipal: number;
  status: 'pending' | 'paid' | 'overdue' | 'failed' | 'waived';
  paidAmount?: number;
  paidDate?: Date;
  paymentMethod?: PaymentMethod;
  lateFee?: number;
  gracePeriodEnd?: Date;
  daysPastDue?: number;
  retryCount: number;
  lastRetryDate?: Date;
  failureReason?: string;
  paymentReference?: string;
  notes?: string;
}

export interface PaymentMethod {
  type: 'bank_account' | 'card' | 'wallet' | 'bank_transfer' | 'mobile_money';
  accountNumber?: string;
  bankCode?: string;
  cardLastFour?: string;
  walletAddress?: string;
  phoneNumber?: string;
  isDefault: boolean;
  isVerified: boolean;
  metadata?: Record<string, any>;
}

export interface PaymentTransaction {
  id: string;
  scheduleId: string;
  scheduledPaymentId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  type: 'scheduled' | 'manual' | 'early' | 'partial' | 'overpayment';
  reference: string;
  externalReference?: string;
  providerResponse?: Record<string, any>;
  failureReason?: string;
  processingFee?: number;
  netAmount?: number;
  initiatedBy: 'system' | 'user' | 'admin';
  initiatedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AutoDebitSetup {
  id: string;
  userId: string;
  scheduleId: string;
  paymentMethod: PaymentMethod;
  isActive: boolean;
  mandateReference?: string;
  agreementDate: Date;
  consentExpiry?: Date;
  maxAmount?: number;
  retrySettings: RetrySettings;
  notificationSettings: NotificationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrySettings {
  enabled: boolean;
  maxRetries: number;
  retryInterval: number; // hours
  backoffMultiplier: number;
  retryOnFailureReasons: string[];
  stopRetryAfter: number; // days
}

export interface NotificationSettings {
  emailReminders: boolean;
  smsReminders: boolean;
  pushNotifications: boolean;
  whatsappReminders: boolean;
  webhookUrl?: string;
  reminderSchedule: ReminderSchedule[];
}

export interface ReminderSchedule {
  type: 'before_due' | 'on_due' | 'after_due';
  daysBefore?: number;
  daysAfter?: number;
  channels: ('email' | 'sms' | 'push' | 'whatsapp')[];
  isActive: boolean;
}

export interface PaymentReminder {
  id: string;
  scheduledPaymentId: string;
  userId: string;
  type: 'before_due' | 'on_due' | 'after_due';
  channel: 'email' | 'sms' | 'push' | 'whatsapp';
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  content: {
    subject?: string;
    message: string;
    templateId?: string;
    variables?: Record<string, any>;
  };
  deliveryReference?: string;
  errorMessage?: string;
  createdAt: Date;
}

export interface PaymentPlan {
  id: string;
  userId: string;
  originalScheduleId: string;
  type: 'restructure' | 'forbearance' | 'extension' | 'reduction';
  reason: string;
  requestedBy: 'user' | 'admin' | 'system';
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed';
  proposedTerms: {
    newTermMonths?: number;
    newPaymentAmount?: number;
    newInterestRate?: number;
    gracePeriodMonths?: number;
    feeWaivers?: string[];
    additionalTerms?: Record<string, any>;
  };
  approvedTerms?: PaymentPlan['proposedTerms'];
  newScheduleId?: string;
  effectiveDate?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EarlyPayment {
  id: string;
  scheduleId: string;
  userId: string;
  paymentAmount: number;
  principalReduction: number;
  interestSavings: number;
  earlyPaymentFee?: number;
  netSavings: number;
  newEndDate: Date;
  newPaymentAmount?: number;
  recalculatedSchedule: ScheduledPayment[];
  status: 'pending' | 'processed' | 'cancelled';
  processedAt?: Date;
  transactionId?: string;
  createdAt: Date;
}

export interface PaymentHoliday {
  id: string;
  scheduleId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  pausedPayments: string[]; // Payment IDs
  reason: string;
  type: 'voluntary' | 'hardship' | 'system';
  status: 'pending' | 'approved' | 'active' | 'completed' | 'cancelled';
  approvedBy?: string;
  approvedAt?: Date;
  resumptionPlan?: {
    resumeDate: Date;
    catchUpPayments?: boolean;
    extendTerm?: boolean;
    modifiedAmount?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface RepaymentAnalytics {
  scheduleId: string;
  period: string;
  totalScheduledAmount: number;
  totalPaidAmount: number;
  totalOutstandingAmount: number;
  onTimePayments: number;
  latePayments: number;
  missedPayments: number;
  averageDaysPastDue: number;
  paymentSuccessRate: number;
  collectionEffectiveness: number;
  currentPrincipalBalance: number;
  totalInterestPaid: number;
  totalLateFeesCharged: number;
  nextPaymentDue: Date;
  nextPaymentAmount: number;
  remainingPayments: number;
  projectedCompletionDate: Date;
  riskScore?: number;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface BulkPaymentOperation {
  id: string;
  type: 'auto_debit' | 'reminder' | 'late_fee_assessment' | 'schedule_update';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  scheduledFor: Date;
  startedAt?: Date;
  completedAt?: Date;
  errors?: Array<{
    itemId: string;
    error: string;
  }>;
  results?: Record<string, any>;
  createdBy: string;
  createdAt: Date;
}

export interface RepaymentSettings {
  defaultGracePeriodDays: number;
  defaultLateFeePercentage: number;
  maxRetryAttempts: number;
  retryIntervalHours: number;
  autoDebitEnabled: boolean;
  reminderSettings: NotificationSettings;
  earlyPaymentAllowed: boolean;
  earlyPaymentFeePercentage: number;
  paymentHolidayAllowed: boolean;
  maxPaymentHolidayDays: number;
  compoundingFrequency: 'daily' | 'monthly' | 'annually';
  roundingPrecision: number;
  cutoffTimes: {
    autoDebit: string; // HH:MM format
    reminders: string;
    reporting: string;
  };
}

export interface RepaymentEvent {
  id: string;
  type: 'payment_due' | 'payment_made' | 'payment_failed' | 'payment_overdue' | 
        'schedule_created' | 'schedule_modified' | 'auto_debit_setup' | 
        'reminder_sent' | 'late_fee_applied' | 'payment_plan_created';
  scheduleId: string;
  userId: string;
  paymentId?: string;
  data: Record<string, any>;
  timestamp: Date;
  processedAt?: Date;
  webhookDelivered?: boolean;
  webhookDeliveredAt?: Date;
}