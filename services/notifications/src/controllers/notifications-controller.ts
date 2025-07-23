import { Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';

import { NotificationsEngine } from '../services/notifications-engine.js';

const logger = pino({ name: 'notifications-controller' });

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: z.enum(['email', 'sms', 'push', 'whatsapp', 'webhook']),
  category: z.enum(['transactional', 'marketing', 'system', 'alert']),
  bodyTemplate: z.string().min(1),
  variables: z.array(z.string()),
  subject: z.string().optional(),
  language: z.string().default('en')
});

const sendNotificationSchema = z.object({
  recipient: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    pushTokens: z.array(z.string()).optional(),
    whatsappNumber: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    timezone: z.string().optional(),
    language: z.string().optional()
  }),
  templateId: z.string().min(1),
  variables: z.record(z.any()).default({}),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  scheduledFor: z.string().datetime().optional(),
  sourceSystem: z.string().optional(),
  sourceReference: z.string().optional(),
  tags: z.array(z.string()).default([])
});

const sendBulkSchema = z.object({
  recipients: z.array(z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    pushTokens: z.array(z.string()).optional(),
    whatsappNumber: z.string().optional(),
    timezone: z.string().optional(),
    language: z.string().optional()
  })).min(1).max(1000),
  templateId: z.string().min(1),
  variables: z.record(z.any()).default({}),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  scheduledFor: z.string().datetime().optional(),
  batchSize: z.number().int().min(1).max(100).default(100)
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: z.enum(['broadcast', 'triggered', 'scheduled']),
  category: z.enum(['marketing', 'system', 'alert']),
  templateId: z.string().min(1),
  audience: z.object({
    targetType: z.enum(['all_users', 'segment', 'individual']),
    segmentCriteria: z.record(z.any()).optional(),
    userIds: z.array(z.string()).optional(),
    estimatedSize: z.number().int().positive().optional()
  }),
  schedule: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime().optional(),
    frequency: z.enum(['once', 'daily', 'weekly', 'monthly']).default('once'),
    timeZone: z.string().default('UTC'),
    sendTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional()
  }).optional(),
  trigger: z.object({
    event: z.string().min(1),
    conditions: z.record(z.any()).optional(),
    delay: z.number().int().min(0).optional()
  }).optional()
});

const webhookDeliverySchema = z.object({
  provider: z.string().min(1),
  messageId: z.string().min(1),
  status: z.string().min(1),
  timestamp: z.string().datetime(),
  metadata: z.record(z.any()).optional()
});

export class NotificationsController {
  constructor(private notificationsEngine: NotificationsEngine) {}

  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createTemplateSchema.parse(req.body);

      const template = await this.notificationsEngine.createTemplate(
        validatedData.name,
        validatedData.description,
        validatedData.type,
        validatedData.category,
        validatedData.bodyTemplate,
        validatedData.variables,
        validatedData.subject,
        validatedData.language
      );

      logger.info({
        templateId: template.id,
        name: validatedData.name,
        type: validatedData.type,
        category: validatedData.category
      }, 'Notification template created successfully');

      res.status(201).json({
        success: true,
        data: template
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error }, 'Failed to create notification template');
      res.status(500).json({
        error: 'Failed to create notification template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendNotification(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = sendNotificationSchema.parse(req.body);
      const scheduledFor = validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined;

      const message = await this.notificationsEngine.sendNotification(
        validatedData.recipient,
        validatedData.templateId,
        validatedData.variables,
        {
          priority: validatedData.priority,
          scheduledFor,
          sourceSystem: validatedData.sourceSystem,
          sourceReference: validatedData.sourceReference,
          tags: validatedData.tags
        }
      );

      logger.info({
        messageId: message.id,
        templateId: validatedData.templateId,
        recipientId: validatedData.recipient.id,
        type: message.type,
        priority: message.priority
      }, 'Notification sent successfully');

      res.status(201).json({
        success: true,
        data: message
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, templateId: req.body.templateId }, 'Failed to send notification');
      res.status(500).json({
        error: 'Failed to send notification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async sendBulkNotifications(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = sendBulkSchema.parse(req.body);
      const scheduledFor = validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined;

      const result = await this.notificationsEngine.sendBulkNotifications(
        validatedData.recipients,
        validatedData.templateId,
        validatedData.variables,
        {
          priority: validatedData.priority,
          scheduledFor,
          batchSize: validatedData.batchSize
        }
      );

      logger.info({
        templateId: validatedData.templateId,
        recipientCount: validatedData.recipients.length,
        successCount: result.successCount,
        failureCount: result.failureCount
      }, 'Bulk notifications sent successfully');

      res.status(201).json({
        success: true,
        data: result
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, templateId: req.body.templateId }, 'Failed to send bulk notifications');
      res.status(500).json({
        error: 'Failed to send bulk notifications',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async createCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User authentication required' });
        return;
      }

      // Check permissions for creating campaigns
      if (!req.user?.roles?.includes('marketing_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to create campaigns' });
        return;
      }

      const validatedData = createCampaignSchema.parse(req.body);

      const campaign = await this.notificationsEngine.createCampaign(
        validatedData.name,
        validatedData.description,
        validatedData.type,
        validatedData.category,
        validatedData.templateId,
        validatedData.audience,
        validatedData.schedule ? {
          ...validatedData.schedule,
          startDate: new Date(validatedData.schedule.startDate),
          endDate: validatedData.schedule.endDate ? new Date(validatedData.schedule.endDate) : undefined
        } : undefined,
        validatedData.trigger,
        userId
      );

      logger.info({
        campaignId: campaign.id,
        name: validatedData.name,
        type: validatedData.type,
        category: validatedData.category,
        createdBy: userId
      }, 'Notification campaign created successfully');

      res.status(201).json({
        success: true,
        data: campaign
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error, userId: req.user?.id }, 'Failed to create notification campaign');
      res.status(500).json({
        error: 'Failed to create notification campaign',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = webhookDeliverySchema.parse(req.body);
      const timestamp = new Date(validatedData.timestamp);

      await this.notificationsEngine.handleDeliveryWebhook(
        validatedData.provider,
        validatedData.messageId,
        validatedData.status,
        timestamp,
        validatedData.metadata
      );

      logger.info({
        provider: validatedData.provider,
        messageId: validatedData.messageId,
        status: validatedData.status,
        timestamp
      }, 'Delivery webhook processed successfully');

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error({ error }, 'Failed to process delivery webhook');
      res.status(500).json({
        error: 'Failed to process webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { period = 'current_month' } = req.query;

      // Check permissions for viewing analytics
      if (!req.user?.roles?.includes('marketing_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to view analytics' });
        return;
      }

      const analytics = await this.notificationsEngine.generateAnalytics(period as string);

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error({ error, period: req.query.period }, 'Failed to get notification analytics');
      res.status(500).json({
        error: 'Failed to get analytics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', type, category, isActive } = req.query;

      // This would typically query the database for templates
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          templates: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0
          }
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get notification templates');
      res.status(500).json({
        error: 'Failed to get templates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', status, type, userId } = req.query;

      // Check permissions for viewing messages
      if (!req.user?.roles?.includes('support_agent') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to view messages' });
        return;
      }

      // This would typically query the database for messages
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          messages: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0
          }
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get notification messages');
      res.status(500).json({
        error: 'Failed to get messages',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getCampaigns(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', status, type, category } = req.query;

      // Check permissions for viewing campaigns
      if (!req.user?.roles?.includes('marketing_manager') && !req.user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Insufficient permissions to view campaigns' });
        return;
      }

      // This would typically query the database for campaigns
      // For now, return a mock response
      res.json({
        success: true,
        data: {
          campaigns: [],
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: 0,
            totalPages: 0
          }
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get notification campaigns');
      res.status(500).json({
        error: 'Failed to get campaigns',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async processDelivery(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      if (!messageId) {
        res.status(400).json({ error: 'Message ID is required' });
        return;
      }

      await this.notificationsEngine.processDelivery(messageId);

      res.json({
        success: true,
        message: 'Message delivery processed successfully'
      });

    } catch (error) {
      logger.error({ error, messageId: req.params.messageId }, 'Failed to process message delivery');
      res.status(500).json({
        error: 'Failed to process delivery',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}