import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { WebSocketManager, NotificationPayload } from '../realtime/websocket-server';

// Notification schemas
const CreateNotificationSchema = z.object({
  type: z.string(),
  title: z.string(),
  message: z.string(),
  channel: z.enum(['loans', 'payments', 'admin', 'system']),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  data: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  persistToDB: z.boolean().default(true),
  sendEmail: z.boolean().default(false),
  sendSMS: z.boolean().default(false),
  scheduledFor: z.date().optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

export interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  channel: string;
  title: string;
  message: string;
  variables: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
}

export interface NotificationEvent {
  type: 'loan_application_submitted' | 'loan_approved' | 'loan_rejected' | 
        'payment_successful' | 'payment_failed' | 'payment_overdue' |
        'user_registered' | 'kyc_approved' | 'kyc_rejected' |
        'system_maintenance' | 'admin_alert';
  data: Record<string, any>;
  userId?: string;
  triggeredBy?: string;
  timestamp: Date;
}

export class NotificationService extends EventEmitter {
  private templates: Map<string, NotificationTemplate> = new Map();
  private scheduledNotifications: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private wsManager: WebSocketManager,
    private logger: any
  ) {
    super();
    this.setupEventListeners();
    this.loadDefaultTemplates();
  }

  // Create and send notification
  async createNotification(input: CreateNotificationInput): Promise<string> {
    const validated = CreateNotificationSchema.parse(input);
    
    const notification: NotificationPayload = {
      id: uuidv4(),
      type: validated.type,
      title: validated.title,
      message: validated.message,
      channel: validated.channel,
      userId: validated.userId,
      roles: validated.roles,
      data: validated.data,
      priority: validated.priority,
      timestamp: new Date(),
    };

    // Schedule notification if requested
    if (validated.scheduledFor) {
      return this.scheduleNotification(notification, validated.scheduledFor);
    }

    // Send immediately
    return this.sendNotification(notification, {
      persistToDB: validated.persistToDB,
      sendEmail: validated.sendEmail,
      sendSMS: validated.sendSMS,
    });
  }

  // Send notification through multiple channels
  private async sendNotification(
    notification: NotificationPayload,
    options: {
      persistToDB: boolean;
      sendEmail: boolean;
      sendSMS: boolean;
    }
  ): Promise<string> {
    try {
      // Send real-time notification via WebSocket
      this.wsManager.sendNotification(notification);

      // Persist to database if requested
      if (options.persistToDB) {
        await this.persistNotification(notification);
      }

      // Send email if requested
      if (options.sendEmail && notification.userId) {
        await this.sendEmailNotification(notification);
      }

      // Send SMS if requested
      if (options.sendSMS && notification.userId) {
        await this.sendSMSNotification(notification);
      }

      this.logger.info(`Notification sent successfully`, {
        notificationId: notification.id,
        type: notification.type,
        channel: notification.channel,
        userId: notification.userId,
      });

      this.emit('notification_sent', notification);
      return notification.id;
    } catch (error) {
      this.logger.error(`Error sending notification:`, error);
      this.emit('notification_error', { notification, error });
      throw error;
    }
  }

  // Event-driven notification creation
  async handleEvent(event: NotificationEvent): Promise<void> {
    const template = this.getTemplateForEvent(event.type);
    if (!template) {
      this.logger.warn(`No template found for event type: ${event.type}`);
      return;
    }

    const notification = this.buildNotificationFromTemplate(template, event);
    
    await this.sendNotification(notification, {
      persistToDB: true,
      sendEmail: this.shouldSendEmail(event.type),
      sendSMS: this.shouldSendSMS(event.type),
    });
  }

  // Template management
  private loadDefaultTemplates() {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'loan_application_submitted',
        name: 'Loan Application Submitted',
        type: 'loan_application_submitted',
        channel: 'loans',
        title: 'Loan Application Received',
        message: 'Your loan application for ${amount} has been received and is being reviewed.',
        variables: ['amount', 'applicationId'],
        priority: 'medium',
        isActive: true,
      },
      {
        id: 'loan_approved',
        name: 'Loan Approved',
        type: 'loan_approved',
        channel: 'loans',
        title: 'Loan Application Approved! 🎉',
        message: 'Congratulations! Your loan application for ${amount} has been approved. Funds will be disbursed within 24 hours.',
        variables: ['amount', 'loanId', 'interestRate'],
        priority: 'high',
        isActive: true,
      },
      {
        id: 'loan_rejected',
        name: 'Loan Rejected',
        type: 'loan_rejected',
        channel: 'loans',
        title: 'Loan Application Update',
        message: 'We regret to inform you that your loan application could not be approved at this time. Reason: ${reason}',
        variables: ['amount', 'reason'],
        priority: 'high',
        isActive: true,
      },
      {
        id: 'payment_successful',
        name: 'Payment Successful',
        type: 'payment_successful',
        channel: 'payments',
        title: 'Payment Processed Successfully',
        message: 'Your payment of ${amount} has been processed successfully. Next payment due: ${nextDueDate}',
        variables: ['amount', 'paymentId', 'nextDueDate'],
        priority: 'medium',
        isActive: true,
      },
      {
        id: 'payment_failed',
        name: 'Payment Failed',
        type: 'payment_failed',
        channel: 'payments',
        title: 'Payment Processing Failed',
        message: 'Your payment of ${amount} could not be processed. Please update your payment method or try again.',
        variables: ['amount', 'reason', 'dueDate'],
        priority: 'high',
        isActive: true,
      },
      {
        id: 'admin_alert',
        name: 'Admin Alert',
        type: 'admin_alert',
        channel: 'admin',
        title: 'Admin Alert: ${alertType}',
        message: '${message}',
        variables: ['alertType', 'message', 'severity'],
        priority: 'critical',
        isActive: true,
      },
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.type, template);
    });
  }

  private getTemplateForEvent(eventType: string): NotificationTemplate | undefined {
    return this.templates.get(eventType);
  }

  private buildNotificationFromTemplate(
    template: NotificationTemplate,
    event: NotificationEvent
  ): NotificationPayload {
    const title = this.interpolateTemplate(template.title, event.data);
    const message = this.interpolateTemplate(template.message, event.data);

    return {
      id: uuidv4(),
      type: template.type,
      title,
      message,
      channel: template.channel as any,
      userId: event.userId,
      data: event.data,
      priority: template.priority,
      timestamp: new Date(),
    };
  }

  private interpolateTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\${(\w+)}/g, (match, key) => {
      return data[key]?.toString() || match;
    });
  }

  // Scheduling
  private scheduleNotification(notification: NotificationPayload, scheduledFor: Date): string {
    const delay = scheduledFor.getTime() - Date.now();
    
    if (delay <= 0) {
      // Send immediately if scheduled time is in the past
      this.sendNotification(notification, {
        persistToDB: true,
        sendEmail: false,
        sendSMS: false,
      });
      return notification.id;
    }

    const timeout = setTimeout(() => {
      this.sendNotification(notification, {
        persistToDB: true,
        sendEmail: false,
        sendSMS: false,
      });
      this.scheduledNotifications.delete(notification.id);
    }, delay);

    this.scheduledNotifications.set(notification.id, timeout);
    
    this.logger.info(`Notification scheduled`, {
      notificationId: notification.id,
      scheduledFor: scheduledFor.toISOString(),
    });

    return notification.id;
  }

  // Integration methods (to be implemented with actual services)
  private async persistNotification(notification: NotificationPayload): Promise<void> {
    // TODO: Implement database persistence
    this.logger.debug(`Persisting notification to database`, {
      notificationId: notification.id,
    });
  }

  private async sendEmailNotification(notification: NotificationPayload): Promise<void> {
    // TODO: Implement email service integration
    this.logger.debug(`Sending email notification`, {
      notificationId: notification.id,
      userId: notification.userId,
    });
  }

  private async sendSMSNotification(notification: NotificationPayload): Promise<void> {
    // TODO: Implement SMS service integration
    this.logger.debug(`Sending SMS notification`, {
      notificationId: notification.id,
      userId: notification.userId,
    });
  }

  private shouldSendEmail(eventType: string): boolean {
    const emailEvents = [
      'loan_approved',
      'loan_rejected',
      'payment_failed',
      'user_registered',
    ];
    return emailEvents.includes(eventType);
  }

  private shouldSendSMS(eventType: string): boolean {
    const smsEvents = [
      'loan_approved',
      'payment_failed',
      'payment_overdue',
    ];
    return smsEvents.includes(eventType);
  }

  private setupEventListeners() {
    // Listen for WebSocket connection events
    this.wsManager.on('connection_established', (connectionId: string) => {
      this.logger.info(`New WebSocket connection: ${connectionId}`);
    });

    this.wsManager.on('connection_closed', (connectionId: string) => {
      this.logger.info(`WebSocket connection closed: ${connectionId}`);
    });
  }

  // Public API methods
  public async sendToUser(userId: string, message: any): Promise<void> {
    this.wsManager.sendToUser(userId, message);
  }

  public async sendToChannel(channel: string, message: any): Promise<void> {
    this.wsManager.sendToChannel(channel, message);
  }

  public async sendToRole(role: string, message: any): Promise<void> {
    this.wsManager.sendToRole(role, message);
  }

  public getStats() {
    return {
      ...this.wsManager.getStats(),
      scheduledNotifications: this.scheduledNotifications.size,
      availableTemplates: this.templates.size,
    };
  }

  // Cleanup
  public shutdown(): void {
    this.scheduledNotifications.forEach(timeout => clearTimeout(timeout));
    this.scheduledNotifications.clear();
    this.removeAllListeners();
  }
}