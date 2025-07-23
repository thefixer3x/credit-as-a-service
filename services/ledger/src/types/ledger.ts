export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subtype: 'current_asset' | 'fixed_asset' | 'current_liability' | 'long_term_liability' | 
           'equity' | 'operating_revenue' | 'non_operating_revenue' | 'operating_expense' | 'non_operating_expense';
  normalBalance: 'debit' | 'credit';
  parentAccountId?: string;
  level: number;
  isActive: boolean;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: Date;
  description: string;
  reference?: string;
  source: 'manual' | 'system' | 'automated' | 'api';
  sourceDocumentType?: 'invoice' | 'payment' | 'disbursement' | 'adjustment' | 'accrual' | 'reversal';
  sourceDocumentId?: string;
  status: 'draft' | 'posted' | 'reversed' | 'cancelled';
  totalDebitAmount: number;
  totalCreditAmount: number;
  currency: string;
  exchangeRate?: number;
  baseCurrency?: string;
  postingPeriod: string; // YYYY-MM format
  lineItems: LedgerLineItem[];
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  postedBy?: string;
  postedAt?: Date;
  reversalReason?: string;
  reversedBy?: string;
  reversedAt?: Date;
  originalEntryId?: string; // For reversal entries
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerLineItem {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  currency: string;
  exchangeRate?: number;
  description?: string;
  reference?: string;
  entityId?: string; // Customer, supplier, etc.
  entityType?: 'customer' | 'supplier' | 'employee' | 'partner';
  costCenter?: string;
  department?: string;
  project?: string;
  location?: string;
  reconciliationStatus: 'unreconciled' | 'reconciled' | 'partially_reconciled';
  reconciledAmount?: number;
  reconciledDate?: Date;
  reconciledBy?: string;
  dimensions?: Record<string, string>; // Additional dimensions
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
  currency: string;
  asOfDate: Date;
  period: string;
  openingBalance: number;
  closingBalance: number;
  periodDebits: number;
  periodCredits: number;
  lastUpdated: Date;
}

export interface TrialBalance {
  id: string;
  period: string;
  asOfDate: Date;
  currency: string;
  accounts: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: Account['type'];
    debitBalance: number;
    creditBalance: number;
    netBalance: number;
  }>;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  variance: number;
  generatedBy: string;
  generatedAt: Date;
}

export interface GeneralLedger {
  accountId: string;
  accountCode: string;
  accountName: string;
  period: string;
  openingBalance: number;
  entries: Array<{
    date: Date;
    journalEntryId: string;
    description: string;
    reference?: string;
    debitAmount: number;
    creditAmount: number;
    runningBalance: number;
  }>;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  entryCount: number;
}

export interface FinancialStatement {
  id: string;
  type: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'statement_of_equity';
  period: string;
  startDate: Date;
  endDate: Date;
  currency: string;
  data: Record<string, any>; // Statement-specific structure
  metadata?: {
    consolidation?: boolean;
    adjustments?: string[];
    notes?: string[];
  };
  status: 'draft' | 'preliminary' | 'final' | 'published';
  generatedBy: string;
  generatedAt: Date;
  publishedAt?: Date;
}

export interface BalanceSheet extends Omit<FinancialStatement, 'data'> {
  data: {
    assets: {
      currentAssets: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      fixedAssets: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      totalAssets: number;
    };
    liabilities: {
      currentLiabilities: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      longTermLiabilities: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      totalLiabilities: number;
    };
    equity: {
      equityAccounts: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      totalEquity: number;
    };
    totalLiabilitiesAndEquity: number;
  };
}

export interface IncomeStatement extends Omit<FinancialStatement, 'data'> {
  data: {
    revenue: {
      operatingRevenue: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      nonOperatingRevenue: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      totalRevenue: number;
    };
    expenses: {
      operatingExpenses: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      nonOperatingExpenses: Array<{
        accountCode: string;
        accountName: string;
        amount: number;
      }>;
      totalExpenses: number;
    };
    grossProfit: number;
    operatingIncome: number;
    netIncome: number;
  };
}

export interface LedgerTransaction {
  id: string;
  type: 'disbursement' | 'repayment' | 'fee' | 'interest' | 'adjustment' | 'writeoff' | 'recovery';
  userId?: string;
  creditApplicationId?: string;
  amount: number;
  currency: string;
  description: string;
  reference?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  journalEntryId?: string;
  accountingRules: Array<{
    accountCode: string;
    debitAmount?: number;
    creditAmount?: number;
    description: string;
  }>;
  sourceSystem: string;
  sourceReference: string;
  businessDate: Date;
  valueDate: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReconciliationRecord {
  id: string;
  type: 'bank_reconciliation' | 'account_reconciliation' | 'intercompany_reconciliation';
  accountId: string;
  period: string;
  statementBalance: number;
  ledgerBalance: number;
  reconciledAmount: number;
  unreconciledItems: Array<{
    lineItemId: string;
    amount: number;
    description: string;
    date: Date;
    reason?: string;
  }>;
  adjustmentEntries: string[]; // Journal entry IDs
  status: 'in_progress' | 'reconciled' | 'discrepancy' | 'pending_approval';
  reconciledBy?: string;
  reconciledAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetEntry {
  id: string;
  accountId: string;
  accountCode: string;
  period: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
  forecastAmount?: number;
  currency: string;
  version: string;
  status: 'draft' | 'approved' | 'locked';
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditTrail {
  id: string;
  entityType: 'journal_entry' | 'account' | 'reconciliation' | 'budget' | 'statement';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'post' | 'reverse' | 'approve' | 'reject';
  userId: string;
  userName: string;
  timestamp: Date;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface LedgerSettings {
  baseCurrency: string;
  fiscalYearStart: string; // MM-DD format
  accountCodeFormat: string;
  requireApprovalForManualEntries: boolean;
  requireApprovalThreshold?: number;
  allowNegativeBalances: boolean;
  automaticPeriodClose: boolean;
  periodCloseDay: number; // Day of month
  retentionPeriodYears: number;
  auditSettings: {
    enableFullAuditTrail: boolean;
    logDataChanges: boolean;
    logUserActions: boolean;
    auditRetentionDays: number;
  };
  reconciliationSettings: {
    autoReconcileThreshold: number;
    requireApprovalForAdjustments: boolean;
    bankReconciliationFrequency: 'daily' | 'weekly' | 'monthly';
  };
  reportingSettings: {
    defaultReportingCurrency: string;
    includeInactiveAccounts: boolean;
    showZeroBalances: boolean;
    decimalPlaces: number;
  };
}

export interface LedgerEvent {
  id: string;
  type: 'entry_posted' | 'entry_reversed' | 'account_created' | 'account_updated' | 
        'reconciliation_completed' | 'statement_generated' | 'period_closed' | 'budget_approved';
  entityId: string;
  entityType: string;
  userId: string;
  data: Record<string, any>;
  timestamp: Date;
  processedAt?: Date;
  webhookDelivered?: boolean;
  webhookDeliveredAt?: Date;
}

export interface LedgerAnalytics {
  period: string;
  totalEntries: number;
  totalLineItems: number;
  totalTransactionVolume: number;
  averageEntrySize: number;
  entriesBySource: Record<string, number>;
  entriesByType: Record<string, number>;
  accountUtilization: Array<{
    accountCode: string;
    accountName: string;
    transactionCount: number;
    totalVolume: number;
  }>;
  reconciliationStats: {
    totalReconciliations: number;
    completedReconciliations: number;
    pendingReconciliations: number;
    averageReconciliationTime: number;
  };
  complianceMetrics: {
    entriesRequiringApproval: number;
    unapprovedEntries: number;
    reversedEntries: number;
    auditTrailCompleteness: number;
  };
  performanceMetrics: {
    averagePostingTime: number;
    failedPostings: number;
    systemAvailability: number;
  };
}