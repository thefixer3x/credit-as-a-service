import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

import { validateEnv } from '@caas/config';
import { CacheService } from '@caas/cache';

import type {
  Account,
  JournalEntry,
  LedgerLineItem,
  AccountBalance,
  TrialBalance,
  LedgerTransaction,
  ReconciliationRecord,
  LedgerEvent,
  LedgerSettings,
  LedgerAnalytics
} from '../types/ledger.js';

const logger = pino({ name: 'ledger-engine' });
const env = validateEnv();

export class LedgerEngine {
  private cache: CacheService;
  private settings: LedgerSettings;

  constructor(cache: CacheService) {
    this.cache = cache;
    this.initializeSettings();
    this.initializeChartOfAccounts();
  }

  /**
   * Create or update account
   */
  async createAccount(
    code: string,
    name: string,
    type: Account['type'],
    subtype: Account['subtype'],
    parentAccountId?: string,
    description?: string
  ): Promise<Account> {
    try {
      const accountId = uuidv4();
      const normalBalance = this.determineNormalBalance(type);
      const level = parentAccountId ? await this.calculateAccountLevel(parentAccountId) + 1 : 1;

      const account: Account = {
        id: accountId,
        code,
        name,
        type,
        subtype,
        normalBalance,
        parentAccountId,
        level,
        isActive: true,
        description,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate account code uniqueness
      const existingAccount = await this.getAccountByCode(code);
      if (existingAccount) {
        throw new Error(`Account with code ${code} already exists`);
      }

      // Save account
      await this.saveAccount(account);

      // Create event
      await this.createEvent('account_created', account.id, 'account', '', {
        code,
        name,
        type
      });

      logger.info({
        accountId,
        code,
        name,
        type
      }, 'Account created successfully');

      return account;
    } catch (error) {
      logger.error({ error, code, name }, 'Failed to create account');
      throw error;
    }
  }

  /**
   * Create journal entry
   */
  async createJournalEntry(
    description: string,
    lineItems: Array<{
      accountCode: string;
      debitAmount?: number;
      creditAmount?: number;
      description?: string;
      reference?: string;
      entityId?: string;
      entityType?: string;
    }>,
    reference?: string,
    source: JournalEntry['source'] = 'manual',
    sourceDocumentType?: JournalEntry['sourceDocumentType'],
    sourceDocumentId?: string,
    userId?: string
  ): Promise<JournalEntry> {
    try {
      const entryId = uuidv4();
      const entryNumber = await this.generateEntryNumber();
      const date = new Date();
      const currency = this.settings.baseCurrency;
      const postingPeriod = this.getPostingPeriod(date);

      // Validate and process line items
      const processedLineItems: LedgerLineItem[] = [];
      let totalDebits = 0;
      let totalCredits = 0;

      for (const item of lineItems) {
        const account = await this.getAccountByCode(item.accountCode);
        if (!account) {
          throw new Error(`Account ${item.accountCode} not found`);
        }

        const debitAmount = item.debitAmount || 0;
        const creditAmount = item.creditAmount || 0;

        if (debitAmount === 0 && creditAmount === 0) {
          throw new Error('Line item must have either debit or credit amount');
        }

        if (debitAmount > 0 && creditAmount > 0) {
          throw new Error('Line item cannot have both debit and credit amounts');
        }

        const lineItem: LedgerLineItem = {
          id: uuidv4(),
          journalEntryId: entryId,
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debitAmount,
          creditAmount,
          currency,
          description: item.description,
          reference: item.reference,
          entityId: item.entityId,
          entityType: item.entityType as any,
          reconciliationStatus: 'unreconciled',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        processedLineItems.push(lineItem);
        totalDebits += debitAmount;
        totalCredits += creditAmount;
      }

      // Validate double-entry requirement
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`Journal entry is not balanced: debits=${totalDebits}, credits=${totalCredits}`);
      }

      // Check approval requirement
      const requiresApproval = this.requiresApproval(source, totalDebits, userId);

      const journalEntry: JournalEntry = {
        id: entryId,
        entryNumber,
        date,
        description,
        reference,
        source,
        sourceDocumentType,
        sourceDocumentId,
        status: requiresApproval ? 'draft' : 'posted',
        totalDebitAmount: totalDebits,
        totalCreditAmount: totalCredits,
        currency,
        postingPeriod,
        lineItems: processedLineItems,
        approvalRequired: requiresApproval,
        postedBy: requiresApproval ? undefined : userId,
        postedAt: requiresApproval ? undefined : new Date(),
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save journal entry
      await this.saveJournalEntry(journalEntry);

      // Update account balances if posted
      if (journalEntry.status === 'posted') {
        await this.updateAccountBalances(journalEntry);
      }

      // Create event
      await this.createEvent('entry_posted', entryId, 'journal_entry', userId || '', {
        entryNumber,
        totalAmount: totalDebits,
        lineItemCount: processedLineItems.length,
        requiresApproval
      });

      logger.info({
        entryId,
        entryNumber,
        totalDebits,
        totalCredits,
        status: journalEntry.status
      }, 'Journal entry created successfully');

      return journalEntry;
    } catch (error) {
      logger.error({ error, description }, 'Failed to create journal entry');
      throw error;
    }
  }

  /**
   * Post journal entry (if draft)
   */
  async postJournalEntry(entryId: string, userId: string): Promise<JournalEntry> {
    try {
      const entry = await this.getJournalEntry(entryId);
      if (!entry) {
        throw new Error('Journal entry not found');
      }

      if (entry.status !== 'draft') {
        throw new Error(`Cannot post entry with status: ${entry.status}`);
      }

      entry.status = 'posted';
      entry.postedBy = userId;
      entry.postedAt = new Date();
      entry.updatedAt = new Date();

      // Update account balances
      await this.updateAccountBalances(entry);

      // Save updated entry
      await this.saveJournalEntry(entry);

      logger.info({
        entryId,
        entryNumber: entry.entryNumber,
        postedBy: userId
      }, 'Journal entry posted successfully');

      return entry;
    } catch (error) {
      logger.error({ error, entryId, userId }, 'Failed to post journal entry');
      throw error;
    }
  }

  /**
   * Reverse journal entry
   */
  async reverseJournalEntry(
    entryId: string,
    reason: string,
    userId: string
  ): Promise<JournalEntry> {
    try {
      const originalEntry = await this.getJournalEntry(entryId);
      if (!originalEntry) {
        throw new Error('Original journal entry not found');
      }

      if (originalEntry.status !== 'posted') {
        throw new Error('Can only reverse posted journal entries');
      }

      // Create reversal line items
      const reversalLineItems = originalEntry.lineItems.map(item => ({
        accountCode: item.accountCode,
        debitAmount: item.creditAmount, // Flip debit/credit
        creditAmount: item.debitAmount,
        description: `Reversal: ${item.description || ''}`,
        reference: item.reference,
        entityId: item.entityId,
        entityType: item.entityType
      }));

      // Create reversal entry
      const reversalEntry = await this.createJournalEntry(
        `Reversal: ${originalEntry.description}`,
        reversalLineItems,
        originalEntry.reference,
        'manual',
        'reversal',
        originalEntry.id,
        userId
      );

      // Update original entry
      originalEntry.status = 'reversed';
      originalEntry.reversalReason = reason;
      originalEntry.reversedBy = userId;
      originalEntry.reversedAt = new Date();
      originalEntry.updatedAt = new Date();

      await this.saveJournalEntry(originalEntry);

      // Create event
      await this.createEvent('entry_reversed', entryId, 'journal_entry', userId, {
        reversalEntryId: reversalEntry.id,
        reason
      });

      logger.info({
        originalEntryId: entryId,
        reversalEntryId: reversalEntry.id,
        reason,
        reversedBy: userId
      }, 'Journal entry reversed successfully');

      return reversalEntry;
    } catch (error) {
      logger.error({ error, entryId, userId }, 'Failed to reverse journal entry');
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string, asOfDate?: Date): Promise<AccountBalance | null> {
    try {
      const account = await this.getAccount(accountId);
      if (!account) {
        return null;
      }

      const effectiveDate = asOfDate || new Date();
      const period = this.getPostingPeriod(effectiveDate);

      // In production, this would query the database
      // For now, return mock balance
      const balance: AccountBalance = {
        accountId,
        accountCode: account.code,
        accountName: account.name,
        debitBalance: 0,
        creditBalance: 0,
        netBalance: 0,
        currency: this.settings.baseCurrency,
        asOfDate: effectiveDate,
        period,
        openingBalance: 0,
        closingBalance: 0,
        periodDebits: 0,
        periodCredits: 0,
        lastUpdated: new Date()
      };

      return balance;
    } catch (error) {
      logger.error({ error, accountId }, 'Failed to get account balance');
      throw error;
    }
  }

  /**
   * Generate trial balance
   */
  async generateTrialBalance(period: string, userId: string): Promise<TrialBalance> {
    try {
      const trialBalanceId = uuidv4();
      const asOfDate = this.getLastDayOfPeriod(period);

      // In production, this would query all account balances
      const accounts = await this.getAllAccounts();
      const accountBalances = [];
      let totalDebits = 0;
      let totalCredits = 0;

      for (const account of accounts) {
        const balance = await this.getAccountBalance(account.id, asOfDate);
        if (balance && (balance.debitBalance !== 0 || balance.creditBalance !== 0)) {
          accountBalances.push({
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            accountType: account.type,
            debitBalance: balance.debitBalance,
            creditBalance: balance.creditBalance,
            netBalance: balance.netBalance
          });

          totalDebits += balance.debitBalance;
          totalCredits += balance.creditBalance;
        }
      }

      const trialBalance: TrialBalance = {
        id: trialBalanceId,
        period,
        asOfDate,
        currency: this.settings.baseCurrency,
        accounts: accountBalances,
        totalDebits,
        totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        variance: totalDebits - totalCredits,
        generatedBy: userId,
        generatedAt: new Date()
      };

      // Cache trial balance
      await this.cache.set(`trialbalance:${trialBalanceId}`, trialBalance, 86400);

      logger.info({
        trialBalanceId,
        period,
        totalDebits,
        totalCredits,
        isBalanced: trialBalance.isBalanced
      }, 'Trial balance generated successfully');

      return trialBalance;
    } catch (error) {
      logger.error({ error, period, userId }, 'Failed to generate trial balance');
      throw error;
    }
  }

  /**
   * Create ledger transaction from business event
   */
  async createLedgerTransaction(
    type: LedgerTransaction['type'],
    amount: number,
    description: string,
    accountingRules: LedgerTransaction['accountingRules'],
    sourceSystem: string,
    sourceReference: string,
    userId?: string,
    creditApplicationId?: string
  ): Promise<LedgerTransaction> {
    try {
      const transactionId = uuidv4();
      const currency = this.settings.baseCurrency;

      const transaction: LedgerTransaction = {
        id: transactionId,
        type,
        userId,
        creditApplicationId,
        amount,
        currency,
        description,
        status: 'pending',
        accountingRules,
        sourceSystem,
        sourceReference,
        businessDate: new Date(),
        valueDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create journal entry from accounting rules
      const lineItems = accountingRules.map(rule => ({
        accountCode: rule.accountCode,
        debitAmount: rule.debitAmount,
        creditAmount: rule.creditAmount,
        description: rule.description,
        reference: sourceReference,
        entityId: userId,
        entityType: 'customer' as const
      }));

      const journalEntry = await this.createJournalEntry(
        description,
        lineItems,
        sourceReference,
        'automated',
        type as any,
        transactionId
      );

      transaction.journalEntryId = journalEntry.id;
      transaction.status = 'completed';
      transaction.updatedAt = new Date();

      // Save transaction
      await this.cache.set(`ledgertxn:${transactionId}`, transaction, 86400 * 90);

      logger.info({
        transactionId,
        type,
        amount,
        journalEntryId: journalEntry.id
      }, 'Ledger transaction created successfully');

      return transaction;
    } catch (error) {
      logger.error({ error, type, amount }, 'Failed to create ledger transaction');
      throw error;
    }
  }

  /**
   * Generate analytics
   */
  async generateAnalytics(period: string): Promise<LedgerAnalytics> {
    try {
      // In production, this would query actual data
      const analytics: LedgerAnalytics = {
        period,
        totalEntries: 1250,
        totalLineItems: 3800,
        totalTransactionVolume: 15000000,
        averageEntrySize: 12000,
        entriesBySource: {
          'automated': 850,
          'api': 200,
          'manual': 150,
          'system': 50
        },
        entriesByType: {
          'disbursement': 400,
          'repayment': 350,
          'fee': 200,
          'interest': 150,
          'adjustment': 100,
          'other': 50
        },
        accountUtilization: [],
        reconciliationStats: {
          totalReconciliations: 45,
          completedReconciliations: 42,
          pendingReconciliations: 3,
          averageReconciliationTime: 2.5
        },
        complianceMetrics: {
          entriesRequiringApproval: 150,
          unapprovedEntries: 8,
          reversedEntries: 12,
          auditTrailCompleteness: 0.998
        },
        performanceMetrics: {
          averagePostingTime: 125,
          failedPostings: 2,
          systemAvailability: 0.9995
        }
      };

      return analytics;
    } catch (error) {
      logger.error({ error, period }, 'Failed to generate ledger analytics');
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private determineNormalBalance(accountType: Account['type']): 'debit' | 'credit' {
    switch (accountType) {
      case 'asset':
      case 'expense':
        return 'debit';
      case 'liability':
      case 'equity':
      case 'revenue':
        return 'credit';
      default:
        return 'debit';
    }
  }

  private async calculateAccountLevel(parentAccountId: string): Promise<number> {
    const parentAccount = await this.getAccount(parentAccountId);
    return parentAccount ? parentAccount.level : 0;
  }

  private async getAccountByCode(code: string): Promise<Account | null> {
    return await this.cache.get<Account>(`account:code:${code}`);
  }

  private async getAccount(accountId: string): Promise<Account | null> {
    return await this.cache.get<Account>(`account:${accountId}`);
  }

  private async getAllAccounts(): Promise<Account[]> {
    // In production, this would query the database
    return [];
  }

  private async saveAccount(account: Account): Promise<void> {
    await this.cache.set(`account:${account.id}`, account, 86400 * 365);
    await this.cache.set(`account:code:${account.code}`, account, 86400 * 365);
  }

  private async generateEntryNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await this.getNextSequenceNumber(`journal_entry_${year}`);
    return `JE${year}${sequence.toString().padStart(6, '0')}`;
  }

  private async getNextSequenceNumber(key: string): Promise<number> {
    const current = await this.cache.get<number>(`sequence:${key}`) || 0;
    const next = current + 1;
    await this.cache.set(`sequence:${key}`, next, 86400 * 365);
    return next;
  }

  private getPostingPeriod(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  private getLastDayOfPeriod(period: string): Date {
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month, 0); // Last day of the month
  }

  private requiresApproval(source: JournalEntry['source'], amount: number, userId?: string): boolean {
    if (source === 'manual' && this.settings.requireApprovalForManualEntries) {
      return true;
    }
    
    if (this.settings.requireApprovalThreshold && amount > this.settings.requireApprovalThreshold) {
      return true;
    }

    return false;
  }

  private async saveJournalEntry(entry: JournalEntry): Promise<void> {
    entry.updatedAt = new Date();
    await this.cache.set(`journalentry:${entry.id}`, entry, 86400 * 365);
  }

  private async getJournalEntry(entryId: string): Promise<JournalEntry | null> {
    return await this.cache.get<JournalEntry>(`journalentry:${entryId}`);
  }

  private async updateAccountBalances(entry: JournalEntry): Promise<void> {
    // In production, this would update account balance tables
    logger.debug({ entryId: entry.id }, 'Updating account balances');
  }

  private async createEvent(
    type: LedgerEvent['type'],
    entityId: string,
    entityType: string,
    userId: string,
    data: Record<string, any>
  ): Promise<void> {
    const event: LedgerEvent = {
      id: uuidv4(),
      type,
      entityId,
      entityType,
      userId,
      data,
      timestamp: new Date()
    };

    await this.cache.set(`event:${event.id}`, event, 86400);
    logger.debug({ event }, 'Ledger event created');
  }

  private initializeSettings(): void {
    this.settings = {
      baseCurrency: 'NGN',
      fiscalYearStart: '01-01',
      accountCodeFormat: '####',
      requireApprovalForManualEntries: true,
      requireApprovalThreshold: 100000, // 100k NGN
      allowNegativeBalances: false,
      automaticPeriodClose: true,
      periodCloseDay: 5,
      retentionPeriodYears: 7,
      auditSettings: {
        enableFullAuditTrail: true,
        logDataChanges: true,
        logUserActions: true,
        auditRetentionDays: 2555 // 7 years
      },
      reconciliationSettings: {
        autoReconcileThreshold: 1.00,
        requireApprovalForAdjustments: true,
        bankReconciliationFrequency: 'daily'
      },
      reportingSettings: {
        defaultReportingCurrency: 'NGN',
        includeInactiveAccounts: false,
        showZeroBalances: false,
        decimalPlaces: 2
      }
    };
  }

  private async initializeChartOfAccounts(): Promise<void> {
    // Initialize basic chart of accounts
    const basicAccounts = [
      { code: '1000', name: 'Cash and Cash Equivalents', type: 'asset' as const, subtype: 'current_asset' as const },
      { code: '1200', name: 'Accounts Receivable', type: 'asset' as const, subtype: 'current_asset' as const },
      { code: '1500', name: 'Loans Receivable', type: 'asset' as const, subtype: 'current_asset' as const },
      { code: '2000', name: 'Accounts Payable', type: 'liability' as const, subtype: 'current_liability' as const },
      { code: '2100', name: 'Accrued Expenses', type: 'liability' as const, subtype: 'current_liability' as const },
      { code: '3000', name: 'Share Capital', type: 'equity' as const, subtype: 'equity' as const },
      { code: '3100', name: 'Retained Earnings', type: 'equity' as const, subtype: 'equity' as const },
      { code: '4000', name: 'Interest Income', type: 'revenue' as const, subtype: 'operating_revenue' as const },
      { code: '4100', name: 'Fee Income', type: 'revenue' as const, subtype: 'operating_revenue' as const },
      { code: '5000', name: 'Interest Expense', type: 'expense' as const, subtype: 'operating_expense' as const },
      { code: '5100', name: 'Provision for Credit Losses', type: 'expense' as const, subtype: 'operating_expense' as const },
      { code: '6000', name: 'Operating Expenses', type: 'expense' as const, subtype: 'operating_expense' as const }
    ];

    for (const accountData of basicAccounts) {
      const existing = await this.getAccountByCode(accountData.code);
      if (!existing) {
        await this.createAccount(
          accountData.code,
          accountData.name,
          accountData.type,
          accountData.subtype
        );
      }
    }

    logger.info('Chart of accounts initialized');
  }
}