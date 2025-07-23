import { Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';

import { CollectionsEngine } from '../services/collections-engine.js';

const logger = pino({ name: 'collections-controller' });

// Validation schemas
const createDelinquencyCaseSchema = z.object({
  creditApplicationId: z.string().min(1),
  repaymentScheduleId: z.string().min(1),
  daysPastDue: z.number().int().min(0),
  outstandingAmount: z.number().positive(),
  overdueAmount: z.number().positive()
});

const createCollectionActionSchema = z.object({
  type: z.enum(['call', 'email', 'sms', 'letter', 'visit', 'legal_notice', 'payment_plan', 'settlement']),
  channel: z.enum(['phone', 'email', 'sms', 'postal', 'in_person', 'whatsapp', 'system']),
  scheduledFor: z.string().datetime(),
  notes: z.string().default(''),
  agentId: z.string().optional()
});

const completeActionSchema = z.object({
  outcome: z.enum(['payment_received', 'promise_to_pay', 'dispute_raised', 'no_contact', 
                   'wrong_number', 'hardship_claimed', 'legal_escalation', 'other']),
  notes: z.string().min(1),
  followUpRequired: z.boolean().default(false),
  followUpDate: z.string().datetime().optional()
});

const createHardshipPlanSchema = z.object({
  type: z.enum(['temporary_reduction', 'payment_holiday', 'restructure', 'settlement', 'forbearance']),
  reason: z.string().min(1),
  proposedTerms: z.object({
    newPaymentAmount: z.number().positive().optional(),
    paymentHolidayMonths: z.number().int().positive().optional(),
    reducedPaymentMonths: z.number().int().positive().optional(),
    settlementAmount: z.number().positive().optional(),
    extendedTermMonths: z.number().int().positive().optional(),
    interestRateReduction: z.number().min(0).max(100).optional(),
    feeWaivers: z.array(z.string()).optional(),
    specialConditions: z.array(z.string()).optional()
  }),
  requestedBy: z.enum(['user', 'agent', 'system']).default('user')
});

const recordPromiseSchema = z.object({
  promisedAmount: z.number().positive(),
  promisedDate: z.string().datetime(),
  promiseType: z.enum(['full_payment', 'partial_payment', 'arrangement_start']),
  actionId: z.string().optional(),
  agentId: z.string().optional()
});

const createDisputeSchema = z.object({
  type: z.enum(['payment_dispute', 'amount_dispute', 'service_dispute', 'fraud_claim', 'identity_theft']),
  description: z.string().min(1),
  claimedAmount: z.number().positive().optional(),
  supportingEvidence: z.array(z.string()).optional()
});

const createLegalReferralSchema = z.object({
  referralReason: z.string().min(1),
  debtAmount: z.number().positive()
});

export class CollectionsController {
  constructor(private collectionsEngine: CollectionsEngine) {}

  async createDelinquencyCase(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User authentication required' });
        return;
      }

      const validatedData = createDelinquencyCaseSchema.parse(req.body);

      const delinquencyCase = await this.collectionsEngine.createDelinquencyCase(
        userId,
        validatedData.creditApplicationId,
        validatedData.repaymentScheduleId,
        validatedData.daysPastDue,
        validatedData.outstandingAmount,
        validatedData.overdueAmount
      );

      logger.info({
        caseId: delinquencyCase.id,
        userId,
        daysPastDue: validatedData.daysPastDue,
        severity: delinquencyCase.severity
      }, 'Delinquency case created successfully');

      res.status(201).json({
        success: true,
        data: delinquencyCase
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, userId: req.user?.id }, 'Failed to create delinquency case');
      res.status(500).json({
        error: 'Failed to create delinquency case',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createCollectionAction(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;
      const agentId = req.user?.id;

      if (!caseId) {
        res.status(400).json({ error: 'Case ID is required' });
        return;
      }

      const validatedData = createCollectionActionSchema.parse(req.body);
      const scheduledFor = new Date(validatedData.scheduledFor);

      const action = await this.collectionsEngine.createCollectionAction(
        caseId,
        validatedData.type,
        validatedData.channel,
        scheduledFor,
        validatedData.agentId || agentId,
        validatedData.notes
      );

      logger.info({
        actionId: action.id,
        caseId,
        type: validatedData.type,
        channel: validatedData.channel
      }, 'Collection action created successfully');

      res.status(201).json({
        success: true,
        data: action
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, caseId: req.params.caseId }, 'Failed to create collection action');
      res.status(500).json({
        error: 'Failed to create collection action',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async completeCollectionAction(req: Request, res: Response): Promise<void> {
    try {
      const { actionId } = req.params;

      if (!actionId) {
        res.status(400).json({ error: 'Action ID is required' });
        return;
      }

      const validatedData = completeActionSchema.parse(req.body);
      const followUpDate = validatedData.followUpDate ? new Date(validatedData.followUpDate) : undefined;

      const action = await this.collectionsEngine.completeCollectionAction(
        actionId,
        validatedData.outcome,
        validatedData.notes,
        validatedData.followUpRequired,
        followUpDate
      );

      logger.info({
        actionId,
        outcome: validatedData.outcome,
        followUpRequired: validatedData.followUpRequired
      }, 'Collection action completed successfully');

      res.json({
        success: true,
        data: action
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, actionId: req.params.actionId }, 'Failed to complete collection action');
      res.status(500).json({
        error: 'Failed to complete collection action',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createHardshipPlan(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;
      const userId = req.user?.id;

      if (!caseId || !userId) {
        res.status(400).json({ error: 'Case ID and user authentication required' });
        return;
      }

      const validatedData = createHardshipPlanSchema.parse(req.body);

      const hardshipPlan = await this.collectionsEngine.createHardshipPlan(
        caseId,
        userId,
        validatedData.type,
        validatedData.reason,
        validatedData.proposedTerms,
        validatedData.requestedBy
      );

      logger.info({
        planId: hardshipPlan.id,
        caseId,
        type: validatedData.type,
        requestedBy: validatedData.requestedBy
      }, 'Hardship plan created successfully');

      res.status(201).json({
        success: true,
        data: hardshipPlan
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, caseId: req.params.caseId, userId: req.user?.id }, 'Failed to create hardship plan');
      res.status(500).json({
        error: 'Failed to create hardship plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async recordPaymentPromise(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;
      const userId = req.user?.id;

      if (!caseId || !userId) {
        res.status(400).json({ error: 'Case ID and user authentication required' });
        return;
      }

      const validatedData = recordPromiseSchema.parse(req.body);
      const promisedDate = new Date(validatedData.promisedDate);

      const promise = await this.collectionsEngine.recordPaymentPromise(
        caseId,
        userId,
        validatedData.promisedAmount,
        promisedDate,
        validatedData.promiseType,
        validatedData.actionId,
        validatedData.agentId
      );

      logger.info({
        promiseId: promise.id,
        caseId,
        promisedAmount: validatedData.promisedAmount,
        promisedDate
      }, 'Payment promise recorded successfully');

      res.status(201).json({
        success: true,
        data: promise
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, caseId: req.params.caseId, userId: req.user?.id }, 'Failed to record payment promise');
      res.status(500).json({
        error: 'Failed to record payment promise',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createDisputeCase(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;
      const userId = req.user?.id;

      if (!caseId || !userId) {
        res.status(400).json({ error: 'Case ID and user authentication required' });
        return;
      }

      const validatedData = createDisputeSchema.parse(req.body);

      const dispute = await this.collectionsEngine.createDisputeCase(
        caseId,
        userId,
        validatedData.type,
        validatedData.description,
        validatedData.claimedAmount,
        validatedData.supportingEvidence
      );

      logger.info({
        disputeId: dispute.id,
        caseId,
        type: validatedData.type,
        claimedAmount: validatedData.claimedAmount
      }, 'Dispute case created successfully');

      res.status(201).json({
        success: true,
        data: dispute
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, caseId: req.params.caseId, userId: req.user?.id }, 'Failed to create dispute case');
      res.status(500).json({
        error: 'Failed to create dispute case',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createLegalReferral(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;
      const userId = req.user?.id;
      const agentId = req.user?.id; // Assuming agent is making the referral

      if (!caseId || !userId || !agentId) {
        res.status(400).json({ error: 'Case ID and authentication required' });
        return;
      }

      // Check if user has permission to create legal referrals
      if (!req.user?.roles?.includes('collections_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions for legal referral' });
        return;
      }

      const validatedData = createLegalReferralSchema.parse(req.body);

      const referral = await this.collectionsEngine.createLegalReferral(
        caseId,
        userId,
        agentId,
        validatedData.referralReason,
        validatedData.debtAmount
      );

      logger.info({
        referralId: referral.id,
        caseId,
        debtAmount: validatedData.debtAmount,
        referredBy: agentId
      }, 'Legal referral created successfully');

      res.status(201).json({
        success: true,
        data: referral
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, caseId: req.params.caseId, userId: req.user?.id }, 'Failed to create legal referral');
      res.status(500).json({
        error: 'Failed to create legal referral',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { period = 'current_month' } = req.query;

      // Check if user has permission to view analytics
      if (!req.user?.roles?.includes('collections_agent') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to view analytics' });
        return;
      }

      const analytics = await this.collectionsEngine.generateAnalytics(period as string);

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get collections analytics');
      res.status(500).json({
        error: 'Failed to get analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getCasesByAgent(req: Request, res: Response): Promise<void> {
    try {
      const agentId = req.user?.id;
      const { page = '1', limit = '10', status } = req.query;

      if (!agentId) {
        res.status(401).json({ error: 'Agent authentication required' });
        return;
      }

      // This would typically query the database for agent's cases
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          cases: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0
          }
        }
      });

    } catch (error) {
      logger.error({ error, agentId: req.user?.id }, 'Failed to get agent cases');
      res.status(500).json({
        error: 'Failed to get agent cases',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getCaseDetails(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;

      if (!caseId) {
        res.status(400).json({ error: 'Case ID is required' });
        return;
      }

      // This would typically fetch case details from database
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          case: null,
          actions: [],
          promises: [],
          hardshipPlans: [],
          disputes: []
        }
      });

    } catch (error) {
      logger.error({ error, caseId: req.params.caseId }, 'Failed to get case details');
      res.status(500).json({
        error: 'Failed to get case details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateCaseAssignment(req: Request, res: Response): Promise<void> {
    try {
      const { caseId } = req.params;
      const { agentId, teamId } = req.body;

      if (!caseId) {
        res.status(400).json({ error: 'Case ID is required' });
        return;
      }

      // Check if user has permission to reassign cases
      if (!req.user?.roles?.includes('collections_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to reassign cases' });
        return;
      }

      // This would typically update case assignment in database
      logger.info({
        caseId,
        newAgentId: agentId,
        newTeamId: teamId,
        assignedBy: req.user?.id
      }, 'Case assignment updated');

      res.json({
        success: true,
        message: 'Case assignment updated successfully'
      });

    } catch (error) {
      logger.error({ error, caseId: req.params.caseId }, 'Failed to update case assignment');
      res.status(500).json({
        error: 'Failed to update case assignment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}