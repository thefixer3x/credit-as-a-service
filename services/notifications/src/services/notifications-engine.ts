import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

import { validateEnv } from '@caas/config';
import { CacheService } from '@caas/cache';

import type {
  NotificationTemplate,
  NotificationMessage,
  NotificationRecipient,
  NotificationCampaign,
  NotificationProvider,
  NotificationEvent,
  NotificationAnalytics,
  WebhookDelivery,
  NotificationSettings,
  DeliveryStatus
} from '../types/notifications.js';

const logger = pino({ name: 'notifications-engine' });
const env = validateEnv();

export class NotificationsEngine {
  private cache: CacheService;
  private settings: NotificationSettings;
  private cronJobs: Map<string, any> = new Map();

  constructor(cache: CacheService) {
    this.cache = cache;
    this.initializeSettings();
    this.initializeProviders();
    this.startScheduledJobs();
  }

  /**
   * Create notification template
   */
  async createTemplate(
    name: string,
    description: string,
    type: NotificationTemplate['type'],
    category: NotificationTemplate['category'],
    bodyTemplate: string,
    variables: string[],
    subject?: string,
    language: string = 'en'
  ): Promise<NotificationTemplate> {
    try {
      const templateId = uuidv4();

      const template: NotificationTemplate = {
        id: templateId,
        name,
        description,
        type,
        category,
        subject,
        bodyTemplate,
        variables,
        isActive: true,
        language,
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save template
      await this.saveTemplate(template);

      logger.info({
        templateId,
        name,
        type,
        category
      }, 'Notification template created successfully');

      return template;
    } catch (error) {
      logger.error({ error, name, type }, 'Failed to create notification template');
      throw error;
    }
  }

  /**
   * Send notification message
   */
  async sendNotification(
    recipient: NotificationRecipient,
    templateId: string,
    variables: Record<string, any> = {},
    options: {
      priority?: NotificationMessage['priority'];
      scheduledFor?: Date;
      sourceSystem?: string;
      sourceReference?: string;
      tags?: string[];
    } = {}
  ): Promise<NotificationMessage> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error('Notification template not found');
      }

      // Check user preferences and blacklist
      if (!(await this.canSendToRecipient(recipient, template.type, template.category))) {
        throw new Error('Cannot send notification to recipient due to preferences or blacklist');
      }

      const messageId = uuidv4();
      const content = this.renderTemplate(template.bodyTemplate, variables);
      const subject = template.subject ? this.renderTemplate(template.subject, variables) : undefined;

      const message: NotificationMessage = {
        id: messageId,
        userId: recipient.id,
        templateId,
        type: template.type,
        category: template.category,
        priority: options.priority || 'medium',
        status: 'pending',
        recipient,
        subject,
        content,
        variables,
        scheduledFor: options.scheduledFor,
        retryCount: 0,
        maxRetries: this.settings.retryPolicy.maxRetries,
        sourceSystem: options.sourceSystem,
        sourceReference: options.sourceReference,
        tags: options.tags || [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save message
      await this.saveMessage(message);

      // Queue for delivery
      if (!options.scheduledFor || options.scheduledFor <= new Date()) {
        await this.queueForDelivery(message);
      }

      // Create event
      await this.createEvent('message_sent', messageId, recipient.id, {
        templateId,
        type: template.type,
        category: template.category,
        priority: message.priority
      });

      logger.info({
        messageId,
        templateId,
        recipientId: recipient.id,
        type: template.type,
        priority: message.priority
      }, 'Notification message created successfully');

      return message;
    } catch (error) {
      logger.error({ error, templateId, recipientId: recipient.id }, 'Failed to send notification');
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(
    recipients: NotificationRecipient[],
    templateId: string,
    variables: Record<string, any> = {},
    options: {
      priority?: NotificationMessage['priority'];
      scheduledFor?: Date;
      batchSize?: number;
    } = {}
  ): Promise<{ successCount: number; failureCount: number; messageIds: string[] }> {
    try {
      const batchSize = options.batchSize || 100;
      const messageIds: string[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Process in batches
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const batchPromises = batch.map(async (recipient) => {
          try {
            const message = await this.sendNotification(recipient, templateId, variables, options);
            messageIds.push(message.id);
            successCount++;
          } catch (error) {
            logger.error({ error, recipientId: recipient.id }, 'Failed to send notification in batch');
            failureCount++;
          }
        });

        await Promise.allSettled(batchPromises);
        
        // Small delay between batches to avoid overwhelming providers
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info({
        totalRecipients: recipients.length,
        successCount,
        failureCount,
        templateId
      }, 'Bulk notification sending completed');

      return { successCount, failureCount, messageIds };
    } catch (error) {
      logger.error({ error, templateId, recipientCount: recipients.length }, 'Failed to send bulk notifications');
      throw error;
    }
  }

  /**
   * Create notification campaign
   */
  async createCampaign(
    name: string,
    description: string,
    type: NotificationCampaign['type'],
    category: NotificationCampaign['category'],
    templateId: string,
    audience: NotificationCampaign['audience'],
    schedule?: NotificationCampaign['schedule'],
    trigger?: NotificationCampaign['trigger'],
    createdBy: string
  ): Promise<NotificationCampaign> {
    try {
      const campaignId = uuidv4();

      const campaign: NotificationCampaign = {
        id: campaignId,
        name,
        description,
        type,
        category,
        status: 'draft',
        templateId,
        audience,
        schedule,
        trigger,
        analytics: {
          totalSent: 0,
          totalDelivered: 0,
          totalFailed: 0,
          deliveryRate: 0
        },
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save campaign
      await this.saveCampaign(campaign);

      logger.info({
        campaignId,
        name,
        type,
        category,
        createdBy
      }, 'Notification campaign created successfully');

      return campaign;
    } catch (error) {
      logger.error({ error, name, type }, 'Failed to create notification campaign');
      throw error;
    }
  }

  /**
   * Process message delivery
   */
  async processDelivery(messageId: string): Promise<void> {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      if (message.status !== 'pending' && message.status !== 'processing') {
        logger.debug({ messageId, status: message.status }, 'Message not eligible for processing');
        return;
      }

      message.status = 'processing';
      message.updatedAt = new Date();
      await this.saveMessage(message);

      // Get provider for message type
      const provider = await this.getProvider(message.type);
      if (!provider) {
        throw new Error(`No provider available for message type: ${message.type}`);
      }

      // Send via provider
      const result = await this.sendViaProvider(message, provider);

      if (result.success) {
        message.status = 'sent';
        message.sentAt = new Date();
        message.provider = provider.name;
        message.providerMessageId = result.providerMessageId;
        message.providerResponse = result.response;
      } else {
        message.status = 'failed';
        message.failedAt = new Date();
        message.errorMessage = result.error;
        message.retryCount++;

        // Schedule retry if within limit
        if (message.retryCount < message.maxRetries) {
          await this.scheduleRetry(message);
        }
      }

      message.updatedAt = new Date();
      await this.saveMessage(message);

      // Create event
      await this.createEvent(
        result.success ? 'message_sent' : 'message_failed',
        messageId,
        message.userId,
        {
          provider: provider.name,
          retryCount: message.retryCount,
          error: result.error
        }
      );

      logger.info({
        messageId,
        status: message.status,
        provider: provider.name,
        retryCount: message.retryCount
      }, 'Message delivery processed');

    } catch (error) {
      logger.error({ error, messageId }, 'Failed to process message delivery');
      throw error;
    }
  }

  /**
   * Handle delivery webhook
   */
  async handleDeliveryWebhook(
    provider: string,
    messageId: string,
    status: string,
    timestamp: Date,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        logger.warn({ messageId, provider }, 'Webhook received for unknown message');
        return;
      }

      // Update delivery status
      const deliveryStatus: DeliveryStatus = {
        messageId,
        status: this.mapProviderStatus(status),
        provider,
        providerMessageId: message.providerMessageId,
        deliveryAttempts: [{
          timestamp,
          status,
          response: JSON.stringify(metadata)
        }],
        metadata
      };

      // Update message status based on webhook
      switch (deliveryStatus.status) {
        case 'delivered':
          message.status = 'delivered';
          message.deliveredAt = timestamp;
          break;
        case 'failed':
        case 'bounced':
          message.status = 'failed';
          message.failedAt = timestamp;
          message.errorMessage = metadata?.error || status;
          break;
      }

      message.updatedAt = new Date();
      await this.saveMessage(message);

      // Save delivery status
      await this.cache.set(`delivery:${messageId}`, deliveryStatus, 86400 * 30);

      // Create event
      await this.createEvent('message_delivered', messageId, message.userId, {
        provider,
        status: deliveryStatus.status,
        deliveredAt: timestamp
      });

      logger.info({
        messageId,
        provider,
        status: deliveryStatus.status,
        deliveredAt: timestamp
      }, 'Delivery webhook processed successfully');

    } catch (error) {
      logger.error({ error, provider, messageId }, 'Failed to handle delivery webhook');
      throw error;
    }
  }

  /**
   * Generate analytics
   */
  async generateAnalytics(period: string = 'current_month'): Promise<NotificationAnalytics> {
    try {
      // In production, this would query actual data
      const analytics: NotificationAnalytics = {
        period,
        totalMessages: 15750,
        messagesByType: {
          'email': 8500,
          'sms': 4200,
          'push': 2800,
          'whatsapp': 250
        },
        messagesByStatus: {
          'sent': 14200,
          'delivered': 13800,
          'failed': 950,
          'pending': 800
        },
        messagesByProvider: {
          'sendgrid': 8500,
          'twilio': 4450,
          'firebase': 2800
        },
        deliveryRate: 0.876,
        failureRate: 0.060,
        averageDeliveryTime: 3.2,
        bounceRate: 0.012,
        unsubscribeRate: 0.008,
        engagement: {
          openRate: 0.245,
          clickRate: 0.032,
          conversionRate: 0.018
        },
        providerPerformance: [
          {
            provider: 'sendgrid',
            totalSent: 8500,
            deliveryRate: 0.91,
            averageDeliveryTime: 2.8,
            errorRate: 0.045
          },
          {
            provider: 'twilio',
            totalSent: 4450,
            deliveryRate: 0.88,
            averageDeliveryTime: 4.1,
            errorRate: 0.082
          }
        ],
        trends: {
          volumeTrend: [],
          deliveryTrend: [],
          engagementTrend: []
        },
        topTemplates: []
      };

      return analytics;
    } catch (error) {
      logger.error({ error, period }, 'Failed to generate notification analytics');
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;
    
    // Simple template variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(placeholder, String(value));
    });

    return rendered;
  }

  private async canSendToRecipient(
    recipient: NotificationRecipient,
    type: NotificationTemplate['type'],
    category: NotificationTemplate['category']
  ): Promise<boolean> {
    // Check blacklist
    let recipientValue: string | undefined;
    switch (type) {
      case 'email':
        recipientValue = recipient.email;
        break;
      case 'sms':
        recipientValue = recipient.phoneNumber;
        break;
      case 'whatsapp':
        recipientValue = recipient.whatsappNumber;
        break;
      default:
        recipientValue = recipient.id;
    }

    if (recipientValue && await this.isBlacklisted(type, recipientValue)) {
      return false;
    }

    // Check preferences
    if (recipient.preferences) {
      const prefs = recipient.preferences;
      switch (type) {
        case 'email':
          return prefs.email.enabled && !prefs.unsubscribeAll && 
                 !prefs.unsubscribedCategories.includes(category);
        case 'sms':
          return prefs.sms.enabled && !prefs.unsubscribeAll && 
                 !prefs.unsubscribedCategories.includes(category);
        case 'push':
          return prefs.push.enabled && !prefs.unsubscribeAll && 
                 !prefs.unsubscribedCategories.includes(category);
        case 'whatsapp':
          return prefs.whatsapp.enabled && !prefs.unsubscribeAll && 
                 !prefs.unsubscribedCategories.includes(category);
      }
    }

    return true;
  }

  private async isBlacklisted(type: string, value: string): Promise<boolean> {
    const blacklistKey = `blacklist:${type}:${value}`;
    return (await this.cache.get(blacklistKey)) !== null;
  }

  private async getProvider(type: NotificationTemplate['type']): Promise<NotificationProvider | null> {
    const providerId = this.settings.providers[type]?.primary;
    if (!providerId) return null;

    return await this.cache.get<NotificationProvider>(`provider:${providerId}`);
  }

  private async sendViaProvider(
    message: NotificationMessage, 
    provider: NotificationProvider
  ): Promise<{ success: boolean; providerMessageId?: string; response?: any; error?: string }> {
    try {
      // Mock provider integration
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate occasional failures
      if (Math.random() < 0.05) {
        return {
          success: false,
          error: 'Simulated provider error'
        };
      }

      return {
        success: true,
        providerMessageId: `${provider.name}_${uuidv4()}`,
        response: { status: 'sent', timestamp: new Date() }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown provider error'
      };
    }
  }

  private mapProviderStatus(providerStatus: string): DeliveryStatus['status'] {
    const statusMap: Record<string, DeliveryStatus['status']> = {
      'delivered': 'delivered',
      'bounced': 'bounced',
      'complained': 'complained',
      'failed': 'failed',
      'sent': 'sent',
      'processing': 'processing'
    };

    return statusMap[providerStatus.toLowerCase()] || 'pending';
  }

  private async queueForDelivery(message: NotificationMessage): Promise<void> {
    // Add to processing queue
    const queueKey = `queue:${message.priority}:${message.type}`;
    await this.cache.listPush(queueKey, message.id);
  }

  private async scheduleRetry(message: NotificationMessage): Promise<void> {
    const delay = this.calculateRetryDelay(message.retryCount);
    const retryAt = new Date(Date.now() + delay * 1000);
    
    await this.cache.set(`retry:${message.id}`, retryAt.getTime(), delay);
    logger.debug({ messageId: message.id, retryAt, retryCount: message.retryCount }, 'Message scheduled for retry');
  }

  private calculateRetryDelay(retryCount: number): number {
    const { initialDelay, backoffMultiplier, maxDelay } = this.settings.retryPolicy;
    const delay = initialDelay * Math.pow(backoffMultiplier, retryCount);
    return Math.min(delay, maxDelay);
  }

  private async saveTemplate(template: NotificationTemplate): Promise<void> {
    await this.cache.set(`template:${template.id}`, template, 86400 * 365);
  }

  private async getTemplate(templateId: string): Promise<NotificationTemplate | null> {
    return await this.cache.get<NotificationTemplate>(`template:${templateId}`);
  }

  private async saveMessage(message: NotificationMessage): Promise<void> {
    message.updatedAt = new Date();
    await this.cache.set(`message:${message.id}`, message, 86400 * 30);
  }

  private async getMessage(messageId: string): Promise<NotificationMessage | null> {
    return await this.cache.get<NotificationMessage>(`message:${messageId}`);
  }

  private async saveCampaign(campaign: NotificationCampaign): Promise<void> {
    await this.cache.set(`campaign:${campaign.id}`, campaign, 86400 * 90);
  }

  private async createEvent(
    type: NotificationEvent['type'],
    messageId: string,
    userId?: string,
    data: Record<string, any> = {}
  ): Promise<void> {
    const event: NotificationEvent = {
      id: uuidv4(),
      type,
      messageId,
      userId,
      data,
      timestamp: new Date()
    };

    await this.cache.set(`event:${event.id}`, event, 86400);
    logger.debug({ event }, 'Notification event created');
  }

  private initializeSettings(): void {
    this.settings = {
      providers: {
        email: {
          primary: 'sendgrid',
          defaultSender: 'noreply@caas.com',
          replyTo: 'support@caas.com'
        },
        sms: {
          primary: 'twilio',
          defaultSender: 'CAAS'
        },
        push: {
          primary: 'firebase'
        },
        whatsapp: {
          primary: 'twilio',
          defaultSender: '+1234567890'
        }
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 60,
        maxDelay: 3600
      },
      rateLimiting: {
        enabled: true,
        globalLimit: 1000,
        perUserLimit: 10,
        perProviderLimit: {
          'sendgrid': 500,
          'twilio': 300,
          'firebase': 1000
        }
      },
      queueSettings: {
        defaultQueue: 'default',
        batchSize: 100,
        processingInterval: 30,
        visibilityTimeout: 300
      },
      webhookSettings: {
        enabled: true,
        signatureSecret: env.WEBHOOK_SECRET || 'default-secret',
        timeout: 30,
        maxRetries: 3
      },
      complianceSettings: {
        gdprCompliant: true,
        optInRequired: true,
        unsubscribeRequired: true,
        dataRetentionDays: 365,
        blacklistEnabled: true
      },
      monitoringSettings: {
        healthCheckInterval: 5,
        alertThresholds: {
          failureRate: 0.1,
          deliveryTime: 300,
          queueDepth: 1000
        },
        alertRecipients: ['admin@caas.com']
      }
    };
  }

  private async initializeProviders(): Promise<void> {
    // Initialize default providers (mock configurations)
    const providers = [
      {
        id: 'sendgrid',
        name: 'SendGrid Email',
        type: 'email' as const,
        provider: 'sendgrid' as const,
        isActive: true,
        isPrimary: true
      },
      {
        id: 'twilio',
        name: 'Twilio SMS',
        type: 'sms' as const,
        provider: 'twilio' as const,
        isActive: true,
        isPrimary: true
      },
      {
        id: 'firebase',
        name: 'Firebase Push',
        type: 'push' as const,
        provider: 'firebase' as const,
        isActive: true,
        isPrimary: true
      }
    ];

    for (const providerData of providers) {
      const provider: NotificationProvider = {
        ...providerData,
        configuration: {},
        limits: {
          dailyLimit: 10000,
          monthlyLimit: 300000,
          rateLimit: 100
        },
        usage: {
          dailyCount: 0,
          monthlyCount: 0,
          lastReset: new Date()
        },
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.cache.set(`provider:${provider.id}`, provider, 86400 * 365);
    }

    logger.info('Notification providers initialized');
  }

  private startScheduledJobs(): void {
    // Process message queues
    const queueProcessorJob = cron.schedule('*/30 * * * * *', async () => {
      await this.processMessageQueues();
    }, { scheduled: false });

    // Process retries
    const retryProcessorJob = cron.schedule('*/60 * * * * *', async () => {
      await this.processRetries();
    }, { scheduled: false });

    // Health checks
    const healthCheckJob = cron.schedule('*/5 * * * *', async () => {
      await this.performHealthChecks();
    }, { scheduled: false });

    this.cronJobs.set('queue_processor', queueProcessorJob);
    this.cronJobs.set('retry_processor', retryProcessorJob);
    this.cronJobs.set('health_check', healthCheckJob);

    // Start jobs
    queueProcessorJob.start();
    retryProcessorJob.start();
    healthCheckJob.start();

    logger.info('Notification scheduled jobs started');
  }

  private async processMessageQueues(): Promise<void> {
    // Process pending messages from queues
    logger.debug('Processing message queues');
  }

  private async processRetries(): Promise<void> {
    // Process scheduled retries
    logger.debug('Processing message retries');
  }

  private async performHealthChecks(): Promise<void> {
    // Check provider health
    logger.debug('Performing provider health checks');
  }
}