import { Request, Response } from 'express';
import pino from 'pino';
import { z } from 'zod';

import { DisbursementOrchestrator } from '../services/disbursement-orchestrator.js';
import type { 
  DisbursementRequest, 
  BatchDisbursement,
  DisbursementSettings 
} from '../types/disbursement.js';

const logger = pino({ name: 'disbursement-controller' });

// Validation schemas
const disbursementRequestSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(['NGN', 'USD', 'GHS', 'KES']),
  recipient: z.object({
    type: z.enum(['bank_account', 'mobile_money', 'wallet']),
    accountNumber: z.string().optional(),
    bankCode: z.string().optional(),
    accountName: z.string().optional(),
    phoneNumber: z.string().optional(),
    walletAddress: z.string().optional(),
    network: z.string().optional()
  }),
  purpose: z.string(),
  reference: z.string().optional(),
  description: z.string().optional(),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
});

const batchDisbursementSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  requests: z.array(disbursementRequestSchema),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
});

export class DisbursementController {
  private orchestrator: DisbursementOrchestrator;

  constructor() {
    this.orchestrator = new DisbursementOrchestrator();
  }

  /**
   * Process single disbursement
   */
  async createDisbursement(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validatedData = disbursementRequestSchema.parse(req.body);
      
      const disbursementRequest: DisbursementRequest = {
        id: `disb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...validatedData,
        createdAt: new Date(),
        status: 'pending'
      };

      logger.info({ 
        requestId: disbursementRequest.id,
        amount: disbursementRequest.amount,
        currency: disbursementRequest.currency 
      }, 'Creating disbursement request');

      const result = await this.orchestrator.processDisbursement(disbursementRequest);

      res.status(201).json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error({ error }, 'Failed to create disbursement');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Process batch disbursement
   */
  async createBatchDisbursement(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validatedData = batchDisbursementSchema.parse(req.body);
      
      const batchRequest: BatchDisbursement = {
        id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...validatedData,
        status: 'pending',
        createdAt: new Date()
      };

      logger.info({ 
        batchId: batchRequest.id,
        requestCount: batchRequest.requests.length 
      }, 'Creating batch disbursement');

      const result = await this.orchestrator.processBatchDisbursement(batchRequest);

      res.status(201).json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error({ error }, 'Failed to create batch disbursement');
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get disbursement status
   */
  async getDisbursementStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Request ID is required'
        });
        return;
      }

      const result = await this.orchestrator.getDisbursementStatus(id);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Disbursement not found'
        });
        return;
      }

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error({ error, requestId: req.params.id }, 'Failed to get disbursement status');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Cancel disbursement
   */
  async cancelDisbursement(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Request ID is required'
        });
        return;
      }

      const cancelled = await this.orchestrator.cancelDisbursement(id);

      res.json({
        success: true,
        data: {
          requestId: id,
          cancelled
        }
      });

    } catch (error) {
      logger.error({ error, requestId: req.params.id }, 'Failed to cancel disbursement');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get provider status
   */
  async getProviderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { providerId } = req.query;

      const statuses = await this.orchestrator.getProviderStatus(
        providerId as string | undefined
      );

      res.json({
        success: true,
        data: statuses
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get provider status');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get analytics
   */
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Start date and end date are required'
        });
        return;
      }

      const analytics = await this.orchestrator.generateAnalytics(
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get analytics');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Perform reconciliation
   */
  async performReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const { providerId, date } = req.params;

      if (!providerId || !date) {
        res.status(400).json({
          success: false,
          error: 'Provider ID and date are required'
        });
        return;
      }

      const report = await this.orchestrator.performReconciliation(providerId, date);

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error({ error, providerId: req.params.providerId }, 'Failed to perform reconciliation');
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const providerStatuses = await this.orchestrator.getProviderStatus();
      const allProvidersHealthy = providerStatuses.every(status => status.isOnline);

      res.json({
        success: true,
        data: {
          service: 'disbursement',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          providers: {
            total: providerStatuses.length,
            healthy: providerStatuses.filter(s => s.isOnline).length,
            unhealthy: providerStatuses.filter(s => !s.isOnline).length
          },
          allProvidersHealthy
        }
      });

    } catch (error) {
      logger.error({ error }, 'Health check failed');
      res.status(503).json({
        success: false,
        error: 'Service unhealthy'
      });
    }
  }

  /**
   * Webhook endpoint for provider callbacks
   */
  async handleProviderWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;
      const webhookData = req.body;

      logger.info({ 
        providerId, 
        eventType: webhookData.eventType 
      }, 'Received provider webhook');

      // Process webhook based on provider and event type
      // This would update the disbursement status in the database

      res.json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      logger.error({ error, providerId: req.params.providerId }, 'Failed to process webhook');
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook'
      });
    }
  }
}