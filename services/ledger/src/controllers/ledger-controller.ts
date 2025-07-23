import { Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';

import { LedgerEngine } from '../services/ledger-engine.js';

const logger = pino({ name: 'ledger-controller' });

// Validation schemas
const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  subtype: z.enum(['current_asset', 'fixed_asset', 'current_liability', 'long_term_liability', 
                   'equity', 'operating_revenue', 'non_operating_revenue', 'operating_expense', 'non_operating_expense']),
  parentAccountId: z.string().optional(),
  description: z.string().optional()
});

const createJournalEntrySchema = z.object({
  description: z.string().min(1),
  lineItems: z.array(z.object({
    accountCode: z.string().min(1),
    debitAmount: z.number().min(0).optional(),
    creditAmount: z.number().min(0).optional(),
    description: z.string().optional(),
    reference: z.string().optional(),
    entityId: z.string().optional(),
    entityType: z.enum(['customer', 'supplier', 'employee', 'partner']).optional()
  })).min(2),
  reference: z.string().optional(),
  source: z.enum(['manual', 'system', 'automated', 'api']).default('manual'),
  sourceDocumentType: z.enum(['invoice', 'payment', 'disbursement', 'adjustment', 'accrual', 'reversal']).optional(),
  sourceDocumentId: z.string().optional()
});

const reversalSchema = z.object({
  reason: z.string().min(1)
});

const createLedgerTransactionSchema = z.object({
  type: z.enum(['disbursement', 'repayment', 'fee', 'interest', 'adjustment', 'writeoff', 'recovery']),
  amount: z.number().positive(),
  description: z.string().min(1),
  accountingRules: z.array(z.object({
    accountCode: z.string().min(1),
    debitAmount: z.number().min(0).optional(),
    creditAmount: z.number().min(0).optional(),
    description: z.string().min(1)
  })).min(2),
  sourceSystem: z.string().min(1),
  sourceReference: z.string().min(1),
  userId: z.string().optional(),
  creditApplicationId: z.string().optional()
});

export class LedgerController {
  constructor(private ledgerEngine: LedgerEngine) {}

  async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createAccountSchema.parse(req.body);

      const account = await this.ledgerEngine.createAccount(
        validatedData.code,
        validatedData.name,
        validatedData.type,
        validatedData.subtype,
        validatedData.parentAccountId,
        validatedData.description
      );

      logger.info({
        accountId: account.id,
        code: validatedData.code,
        name: validatedData.name,
        type: validatedData.type
      }, 'Account created successfully');

      res.status(201).json({
        success: true,
        data: account
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error }, 'Failed to create account');
      res.status(500).json({
        error: 'Failed to create account',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createJournalEntry(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const validatedData = createJournalEntrySchema.parse(req.body);

      const entry = await this.ledgerEngine.createJournalEntry(
        validatedData.description,
        validatedData.lineItems,
        validatedData.reference,
        validatedData.source,
        validatedData.sourceDocumentType,
        validatedData.sourceDocumentId,
        userId
      );

      logger.info({
        entryId: entry.id,
        entryNumber: entry.entryNumber,
        totalAmount: entry.totalDebitAmount,
        status: entry.status,
        userId
      }, 'Journal entry created successfully');

      res.status(201).json({
        success: true,
        data: entry
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, userId: req.user?.id }, 'Failed to create journal entry');
      res.status(500).json({
        error: 'Failed to create journal entry',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async postJournalEntry(req: Request, res: Response): Promise<void> {
    try {
      const { entryId } = req.params;
      const userId = req.user?.id;

      if (!entryId || !userId) {
        res.status(400).json({ error: 'Entry ID and user authentication required' });
        return;
      }

      // Check permissions for posting entries
      if (!req.user?.roles?.includes('accounting_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to post journal entries' });
        return;
      }

      const entry = await this.ledgerEngine.postJournalEntry(entryId, userId);

      logger.info({
        entryId,
        entryNumber: entry.entryNumber,
        postedBy: userId
      }, 'Journal entry posted successfully');

      res.json({
        success: true,
        data: entry
      });

    } catch (error) {
      logger.error({ error, entryId: req.params.entryId, userId: req.user?.id }, 'Failed to post journal entry');
      res.status(500).json({
        error: 'Failed to post journal entry',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async reverseJournalEntry(req: Request, res: Response): Promise<void> {
    try {
      const { entryId } = req.params;
      const userId = req.user?.id;

      if (!entryId || !userId) {
        res.status(400).json({ error: 'Entry ID and user authentication required' });
        return;
      }

      // Check permissions for reversing entries
      if (!req.user?.roles?.includes('accounting_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to reverse journal entries' });
        return;
      }

      const validatedData = reversalSchema.parse(req.body);

      const reversalEntry = await this.ledgerEngine.reverseJournalEntry(
        entryId,
        validatedData.reason,
        userId
      );

      logger.info({
        originalEntryId: entryId,
        reversalEntryId: reversalEntry.id,
        reason: validatedData.reason,
        reversedBy: userId
      }, 'Journal entry reversed successfully');

      res.json({
        success: true,
        data: reversalEntry
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, entryId: req.params.entryId, userId: req.user?.id }, 'Failed to reverse journal entry');
      res.status(500).json({
        error: 'Failed to reverse journal entry',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAccountBalance(req: Request, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      const { asOfDate } = req.query;

      if (!accountId) {
        res.status(400).json({ error: 'Account ID is required' });
        return;
      }

      const date = asOfDate ? new Date(asOfDate as string) : undefined;
      const balance = await this.ledgerEngine.getAccountBalance(accountId, date);

      if (!balance) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      res.json({
        success: true,
        data: balance
      });

    } catch (error) {
      logger.error({ error, accountId: req.params.accountId }, 'Failed to get account balance');
      res.status(500).json({
        error: 'Failed to get account balance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async generateTrialBalance(req: Request, res: Response): Promise<void> {
    try {
      const { period } = req.query;
      const userId = req.user?.id;

      if (!period || !userId) {
        res.status(400).json({ error: 'Period and user authentication required' });
        return;
      }

      // Check permissions for generating reports
      if (!req.user?.roles?.includes('accounting_staff') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to generate trial balance' });
        return;
      }

      const trialBalance = await this.ledgerEngine.generateTrialBalance(period as string, userId);

      logger.info({
        trialBalanceId: trialBalance.id,
        period,
        totalDebits: trialBalance.totalDebits,
        totalCredits: trialBalance.totalCredits,
        isBalanced: trialBalance.isBalanced,
        generatedBy: userId
      }, 'Trial balance generated successfully');

      res.json({
        success: true,
        data: trialBalance
      });

    } catch (error) {
      logger.error({ error, period: req.query.period, userId: req.user?.id }, 'Failed to generate trial balance');
      res.status(500).json({
        error: 'Failed to generate trial balance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createLedgerTransaction(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createLedgerTransactionSchema.parse(req.body);

      const transaction = await this.ledgerEngine.createLedgerTransaction(
        validatedData.type,
        validatedData.amount,
        validatedData.description,
        validatedData.accountingRules,
        validatedData.sourceSystem,
        validatedData.sourceReference,
        validatedData.userId,
        validatedData.creditApplicationId
      );

      logger.info({
        transactionId: transaction.id,
        type: validatedData.type,
        amount: validatedData.amount,
        journalEntryId: transaction.journalEntryId
      }, 'Ledger transaction created successfully');

      res.status(201).json({
        success: true,
        data: transaction
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error }, 'Failed to create ledger transaction');
      res.status(500).json({
        error: 'Failed to create ledger transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { period = 'current_month' } = req.query;

      // Check permissions for viewing analytics
      if (!req.user?.roles?.includes('accounting_staff') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to view analytics' });
        return;
      }

      const analytics = await this.ledgerEngine.generateAnalytics(period as string);

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error({ error, period: req.query.period }, 'Failed to get ledger analytics');
      res.status(500).json({
        error: 'Failed to get analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getJournalEntries(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', status, period } = req.query;

      // Check permissions for viewing journal entries
      if (!req.user?.roles?.includes('accounting_staff') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to view journal entries' });
        return;
      }

      // This would typically query the database for journal entries
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          entries: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0
          }
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get journal entries');
      res.status(500).json({
        error: 'Failed to get journal entries',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getChartOfAccounts(req: Request, res: Response): Promise<void> {
    try {
      // This would typically query the database for accounts
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          accounts: [],
          totalCount: 0
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get chart of accounts');
      res.status(500).json({
        error: 'Failed to get chart of accounts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}