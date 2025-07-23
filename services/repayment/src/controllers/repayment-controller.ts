import { Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';

import { RepaymentEngine } from '../services/repayment-engine.js';
import type { PaymentMethod } from '../types/repayment.js';

const logger = pino({ name: 'repayment-controller' });

// Validation schemas
const createScheduleSchema = z.object({
  creditApplicationId: z.string().min(1),
  principalAmount: z.number().positive(),
  interestRate: z.number().min(0).max(100),
  termMonths: z.number().int().positive(),
  paymentFrequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly']).default('monthly'),
  startDate: z.string().datetime().optional()
});

const processPaymentSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.object({
    type: z.enum(['bank_account', 'card', 'wallet', 'bank_transfer', 'mobile_money']),
    accountNumber: z.string().optional(),
    bankCode: z.string().optional(),
    cardLastFour: z.string().optional(),
    walletAddress: z.string().optional(),
    phoneNumber: z.string().optional(),
    isDefault: z.boolean().default(false),
    isVerified: z.boolean().default(false),
    metadata: z.record(z.any()).optional()
  }),
  initiatedBy: z.enum(['system', 'user', 'admin']).default('user')
});

const setupAutoDebitSchema = z.object({
  paymentMethod: z.object({
    type: z.enum(['bank_account', 'card', 'wallet', 'bank_transfer', 'mobile_money']),
    accountNumber: z.string().optional(),
    bankCode: z.string().optional(),
    cardLastFour: z.string().optional(),
    walletAddress: z.string().optional(),
    phoneNumber: z.string().optional(),
    isDefault: z.boolean().default(false),
    isVerified: z.boolean().default(false),
    metadata: z.record(z.any()).optional()
  }),
  retrySettings: z.object({
    enabled: z.boolean().default(true),
    maxRetries: z.number().int().min(0).max(5).default(3),
    retryInterval: z.number().int().positive().default(24),
    backoffMultiplier: z.number().positive().default(1.5),
    retryOnFailureReasons: z.array(z.string()).default(['insufficient_funds', 'temporary_failure']),
    stopRetryAfter: z.number().int().positive().default(7)
  }).optional(),
  notificationSettings: z.object({
    emailReminders: z.boolean().default(true),
    smsReminders: z.boolean().default(true),
    pushNotifications: z.boolean().default(false),
    whatsappReminders: z.boolean().default(false),
    webhookUrl: z.string().url().optional(),
    reminderSchedule: z.array(z.object({
      type: z.enum(['before_due', 'on_due', 'after_due']),
      daysBefore: z.number().int().positive().optional(),
      daysAfter: z.number().int().positive().optional(),
      channels: z.array(z.enum(['email', 'sms', 'push', 'whatsapp'])),
      isActive: z.boolean().default(true)
    })).default([])
  }).optional()
});

const createPaymentPlanSchema = z.object({
  type: z.enum(['restructure', 'forbearance', 'extension', 'reduction']),
  reason: z.string().min(1),
  proposedTerms: z.object({
    newTermMonths: z.number().int().positive().optional(),
    newPaymentAmount: z.number().positive().optional(),
    newInterestRate: z.number().min(0).max(100).optional(),
    gracePeriodMonths: z.number().int().min(0).optional(),
    feeWaivers: z.array(z.string()).optional(),
    additionalTerms: z.record(z.any()).optional()
  }),
  requestedBy: z.enum(['user', 'admin', 'system']).default('user')
});

const processEarlyPaymentSchema = z.object({
  paymentAmount: z.number().positive()
});

export class RepaymentController {
  constructor(private repaymentEngine: RepaymentEngine) {}

  async createSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User authentication required' });
        return;
      }

      const validatedData = createScheduleSchema.parse(req.body);
      const startDate = validatedData.startDate ? new Date(validatedData.startDate) : undefined;

      const schedule = await this.repaymentEngine.createSchedule(
        validatedData.creditApplicationId,
        userId,
        validatedData.principalAmount,
        validatedData.interestRate,
        validatedData.termMonths,
        validatedData.paymentFrequency,
        startDate
      );

      logger.info({
        scheduleId: schedule.id,
        userId,
        principalAmount: validatedData.principalAmount,
        termMonths: validatedData.termMonths
      }, 'Repayment schedule created successfully');

      res.status(201).json({
        success: true,
        data: schedule
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, userId: req.user?.id }, 'Failed to create repayment schedule');
      res.status(500).json({
        error: 'Failed to create repayment schedule',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { scheduleId } = req.params;
      const userId = req.user?.id;

      if (!scheduleId) {
        res.status(400).json({ error: 'Schedule ID is required' });
        return;
      }

      const schedule = await this.repaymentEngine.getSchedule(scheduleId);
      
      if (!schedule) {
        res.status(404).json({ error: 'Repayment schedule not found' });
        return;
      }

      // Check ownership
      if (schedule.userId !== userId && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json({
        success: true,
        data: schedule
      });

    } catch (error) {
      logger.error({ error, scheduleId: req.params.scheduleId }, 'Failed to get repayment schedule');
      res.status(500).json({
        error: 'Failed to get repayment schedule',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processPayment(req: Request, res: Response): Promise<void> {
    try {
      const { scheduleId } = req.params;
      const userId = req.user?.id;

      if (!scheduleId || !userId) {
        res.status(400).json({ error: 'Schedule ID and user authentication required' });
        return;
      }

      const validatedData = processPaymentSchema.parse(req.body);

      const transaction = await this.repaymentEngine.processPayment(
        scheduleId,
        validatedData.paymentId,
        validatedData.amount,
        validatedData.paymentMethod as PaymentMethod,
        validatedData.initiatedBy
      );

      logger.info({
        transactionId: transaction.id,
        scheduleId,
        paymentId: validatedData.paymentId,
        amount: validatedData.amount,
        status: transaction.status
      }, 'Payment processed successfully');

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

      logger.error({ error, scheduleId: req.params.scheduleId }, 'Failed to process payment');
      res.status(500).json({
        error: 'Failed to process payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async setupAutoDebit(req: Request, res: Response): Promise<void> {
    try {
      const { scheduleId } = req.params;
      const userId = req.user?.id;

      if (!scheduleId || !userId) {
        res.status(400).json({ error: 'Schedule ID and user authentication required' });
        return;
      }

      const validatedData = setupAutoDebitSchema.parse(req.body);

      const autoDebit = await this.repaymentEngine.setupAutoDebit(
        userId,
        scheduleId,
        validatedData.paymentMethod as PaymentMethod,
        validatedData.retrySettings,
        validatedData.notificationSettings
      );

      logger.info({
        autoDebitId: autoDebit.id,
        scheduleId,
        userId,
        paymentMethodType: validatedData.paymentMethod.type
      }, 'Auto debit setup created successfully');

      res.status(201).json({
        success: true,
        data: autoDebit
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, scheduleId: req.params.scheduleId, userId: req.user?.id }, 'Failed to setup auto debit');
      res.status(500).json({
        error: 'Failed to setup auto debit',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendPaymentReminder(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { channel, type } = req.body;

      if (!paymentId) {
        res.status(400).json({ error: 'Payment ID is required' });
        return;
      }

      if (!channel || !type) {
        res.status(400).json({ error: 'Channel and type are required' });
        return;
      }

      const reminder = await this.repaymentEngine.sendPaymentReminder(
        paymentId,
        channel,
        type
      );

      logger.info({
        reminderId: reminder.id,
        paymentId,
        channel,
        type
      }, 'Payment reminder sent successfully');

      res.status(201).json({
        success: true,
        data: reminder
      });

    } catch (error) {
      logger.error({ error, paymentId: req.params.paymentId }, 'Failed to send payment reminder');
      res.status(500).json({
        error: 'Failed to send payment reminder',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createPaymentPlan(req: Request, res: Response): Promise<void> {
    try {
      const { scheduleId } = req.params;
      const userId = req.user?.id;

      if (!scheduleId || !userId) {
        res.status(400).json({ error: 'Schedule ID and user authentication required' });
        return;
      }

      const validatedData = createPaymentPlanSchema.parse(req.body);

      const paymentPlan = await this.repaymentEngine.createPaymentPlan(
        userId,
        scheduleId,
        validatedData.type,
        validatedData.reason,
        validatedData.proposedTerms,
        validatedData.requestedBy
      );

      logger.info({
        paymentPlanId: paymentPlan.id,
        scheduleId,
        userId,
        type: validatedData.type
      }, 'Payment plan created successfully');

      res.status(201).json({
        success: true,
        data: paymentPlan
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, scheduleId: req.params.scheduleId, userId: req.user?.id }, 'Failed to create payment plan');
      res.status(500).json({
        error: 'Failed to create payment plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processEarlyPayment(req: Request, res: Response): Promise<void> {
    try {
      const { scheduleId } = req.params;
      const userId = req.user?.id;

      if (!scheduleId || !userId) {
        res.status(400).json({ error: 'Schedule ID and user authentication required' });
        return;
      }

      const validatedData = processEarlyPaymentSchema.parse(req.body);

      const earlyPayment = await this.repaymentEngine.processEarlyPayment(
        scheduleId,
        validatedData.paymentAmount,
        userId
      );

      logger.info({
        earlyPaymentId: earlyPayment.id,
        scheduleId,
        paymentAmount: validatedData.paymentAmount,
        netSavings: earlyPayment.netSavings
      }, 'Early payment processed successfully');

      res.status(201).json({
        success: true,
        data: earlyPayment
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, scheduleId: req.params.scheduleId, userId: req.user?.id }, 'Failed to process early payment');
      res.status(500).json({
        error: 'Failed to process early payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { scheduleId } = req.params;
      const { period } = req.query;

      if (!scheduleId) {
        res.status(400).json({ error: 'Schedule ID is required' });
        return;
      }

      const analytics = await this.repaymentEngine.generateAnalytics(
        scheduleId,
        period as string
      );

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error({ error, scheduleId: req.params.scheduleId }, 'Failed to get analytics');
      res.status(500).json({
        error: 'Failed to get analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getUserSchedules(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { page = '1', limit = '10', status } = req.query;

      if (!userId) {
        res.status(401).json({ error: 'User authentication required' });
        return;
      }

      // This would typically query the database for user's schedules
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          schedules: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0
          }
        }
      });

    } catch (error) {
      logger.error({ error, userId: req.user?.id }, 'Failed to get user schedules');
      res.status(500).json({
        error: 'Failed to get user schedules',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}