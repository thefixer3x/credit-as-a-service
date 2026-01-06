import { Logger } from '@caas/common';

/**
 * Notification types for provider onboarding
 */
export interface ProviderOnboardingNotification {
  type: 'new_provider_onboarding';
  providerId: string;
  providerName: string;
  assignedAdmin: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Notification types for provider approval
 */
export interface ProviderApprovalNotification {
  type: 'provider_approved';
  providerId: string;
  providerName: string;
  providerEmail: string;
  approvedBy: string;
}

/**
 * Notification types for provider rejection
 */
export interface ProviderRejectionNotification {
  type: 'provider_rejected';
  providerId: string;
  providerName: string;
  providerEmail: string;
  rejectionReason: string;
  rejectedBy: string;
}

/**
 * Notification types for service requests
 */
export interface ServiceRequestNotification {
  type: 'new_service_request';
  requestId: string;
  providerId: string;
  requestType: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedEngineer?: string;
}

/**
 * Notification types for margin updates
 */
export interface MarginUpdateNotification {
  type: 'margin_updated';
  providerId: string;
  newMarginStructure: {
    type: string;
    basePercentage: number;
  };
  effectiveDate: string;
  updatedBy: string;
}

/**
 * Notification types for integration projects
 */
export interface IntegrationProjectNotification {
  type: 'project_initiated';
  providerId: string;
  projectId: string;
  assignedTeam: Array<{ id: string; role: string }>;
  estimatedCompletion: string;
}

/**
 * Notification types for custom integrations
 */
export interface CustomIntegrationNotification {
  type: 'custom_integration_requested';
  integrationId: string;
  providerId: string;
  serviceRequestId: string;
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedDelivery: string;
}

/**
 * Notification types for API setup
 */
export interface APISetupNotification {
  type: 'api_setup_completed';
  providerId: string;
  apiUrl: string;
  setupBy: string;
}

/**
 * Notification types for deployments
 */
export interface DeploymentNotification {
  type: 'integration_deployed';
  integrationId: string;
  deploymentId: string;
  version: string;
  deployedBy: string;
}

/**
 * Notification channel configuration
 */
export interface NotificationChannelConfig {
  email?: {
    enabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    fromAddress?: string;
  };
  slack?: {
    enabled: boolean;
    webhookUrl?: string;
    defaultChannel?: string;
  };
  webhook?: {
    enabled: boolean;
    endpoints?: string[];
  };
  sms?: {
    enabled: boolean;
    provider?: string;
  };
}

/**
 * Notification service for admin provider management.
 *
 * Handles sending notifications across multiple channels (email, Slack, webhooks, SMS)
 * for various provider management events.
 *
 * Note: This is a base implementation that logs notifications.
 * In production, integrate with actual notification providers
 * (SendGrid, Twilio, Slack API, etc.)
 */
export class NotificationService {
  private logger: Logger;
  private config: NotificationChannelConfig;
  private notificationQueue: Array<{
    type: string;
    payload: unknown;
    timestamp: string;
    status: 'pending' | 'sent' | 'failed';
  }> = [];

  constructor(logger: Logger, config?: NotificationChannelConfig) {
    this.logger = logger;
    this.config = config || {
      email: { enabled: true },
      slack: { enabled: false },
      webhook: { enabled: false },
      sms: { enabled: false }
    };
  }

  /**
   * Send notification for new provider onboarding
   */
  async sendProviderOnboardingNotification(
    data: ProviderOnboardingNotification
  ): Promise<void> {
    this.logger.info('Sending provider onboarding notification', {
      providerId: data.providerId,
      providerName: data.providerName,
      assignedAdmin: data.assignedAdmin
    });

    await this.sendNotification({
      type: 'provider_onboarding',
      subject: `New Provider Onboarding: ${data.providerName}`,
      recipients: [data.assignedAdmin],
      priority: data.priority,
      content: {
        title: 'New Provider Onboarding Request',
        message: `A new provider "${data.providerName}" has submitted an onboarding request.`,
        details: data,
        actions: [
          {
            label: 'Review Onboarding',
            url: `/admin/providers/${data.providerId}/onboarding`
          }
        ]
      }
    });
  }

  /**
   * Send notification for provider approval
   */
  async sendProviderApprovalNotification(
    data: ProviderApprovalNotification
  ): Promise<void> {
    this.logger.info('Sending provider approval notification', {
      providerId: data.providerId,
      providerEmail: data.providerEmail
    });

    // Notify the provider
    await this.sendNotification({
      type: 'provider_approved',
      subject: `Welcome to CaaS Platform - ${data.providerName} Approved`,
      recipients: [data.providerEmail],
      priority: 'high',
      content: {
        title: 'Provider Application Approved',
        message: `Congratulations! Your application to join the CaaS platform as "${data.providerName}" has been approved.`,
        details: {
          providerId: data.providerId,
          providerName: data.providerName,
          approvedBy: data.approvedBy,
          approvalDate: new Date().toISOString()
        },
        actions: [
          {
            label: 'Access Dashboard',
            url: `/provider/${data.providerId}/dashboard`
          },
          {
            label: 'Setup Integration',
            url: `/provider/${data.providerId}/integration`
          }
        ]
      }
    });

    // Notify internal team
    await this.sendInternalNotification({
      type: 'provider_approved_internal',
      message: `Provider "${data.providerName}" has been approved by ${data.approvedBy}`,
      channel: 'provider-management'
    });
  }

  /**
   * Send notification for provider rejection
   */
  async sendProviderRejectionNotification(
    data: ProviderRejectionNotification
  ): Promise<void> {
    this.logger.info('Sending provider rejection notification', {
      providerId: data.providerId,
      providerEmail: data.providerEmail
    });

    await this.sendNotification({
      type: 'provider_rejected',
      subject: `CaaS Platform Application Status - ${data.providerName}`,
      recipients: [data.providerEmail],
      priority: 'medium',
      content: {
        title: 'Provider Application Status Update',
        message: `We regret to inform you that your application to join the CaaS platform as "${data.providerName}" was not approved at this time.`,
        details: {
          providerId: data.providerId,
          providerName: data.providerName,
          reason: data.rejectionReason,
          rejectedBy: data.rejectedBy,
          date: new Date().toISOString()
        },
        actions: [
          {
            label: 'Contact Support',
            url: '/support/contact'
          },
          {
            label: 'Reapply',
            url: '/provider/apply'
          }
        ]
      }
    });
  }

  /**
   * Send notification for new service request
   */
  async sendServiceRequestNotification(
    data: ServiceRequestNotification
  ): Promise<void> {
    this.logger.info('Sending service request notification', {
      requestId: data.requestId,
      requestType: data.requestType,
      assignedEngineer: data.assignedEngineer
    });

    const recipients: string[] = [];

    // Add assigned engineer if available
    if (data.assignedEngineer) {
      recipients.push(data.assignedEngineer);
    }

    // Add engineering team channel for high priority
    if (data.priority === 'high' || data.priority === 'urgent') {
      await this.sendInternalNotification({
        type: 'urgent_service_request',
        message: `[${data.priority.toUpperCase()}] New ${data.requestType} service request for provider ${data.providerId}`,
        channel: 'engineering-urgent'
      });
    }

    await this.sendNotification({
      type: 'service_request',
      subject: `New Service Request: ${data.requestType}`,
      recipients,
      priority: data.priority,
      content: {
        title: 'New Service Request Assigned',
        message: `A new ${data.requestType} service request has been created and assigned to you.`,
        details: data,
        actions: [
          {
            label: 'View Request',
            url: `/admin/service-requests/${data.requestId}`
          }
        ]
      }
    });
  }

  /**
   * Send notification for margin configuration update
   */
  async sendMarginUpdateNotification(
    data: MarginUpdateNotification
  ): Promise<void> {
    this.logger.info('Sending margin update notification', {
      providerId: data.providerId,
      newBasePercentage: data.newMarginStructure.basePercentage
    });

    await this.sendNotification({
      type: 'margin_updated',
      subject: 'Margin Configuration Updated',
      recipients: [], // Provider notification endpoint
      priority: 'medium',
      content: {
        title: 'Margin Configuration Updated',
        message: `Your margin configuration has been updated. The new structure will be effective from ${data.effectiveDate}.`,
        details: {
          providerId: data.providerId,
          marginType: data.newMarginStructure.type,
          basePercentage: data.newMarginStructure.basePercentage,
          effectiveDate: data.effectiveDate,
          updatedBy: data.updatedBy
        },
        actions: [
          {
            label: 'View Margin Details',
            url: `/provider/${data.providerId}/margin`
          }
        ]
      }
    });

    // Log for audit
    await this.sendInternalNotification({
      type: 'margin_audit',
      message: `Margin updated for provider ${data.providerId}: ${data.newMarginStructure.basePercentage}% by ${data.updatedBy}`,
      channel: 'finance-audit'
    });
  }

  /**
   * Send notification for integration project initiation
   */
  async sendIntegrationProjectNotification(
    data: IntegrationProjectNotification
  ): Promise<void> {
    this.logger.info('Sending integration project notification', {
      providerId: data.providerId,
      projectId: data.projectId
    });

    // Notify assigned team members
    for (const teamMember of data.assignedTeam) {
      await this.sendNotification({
        type: 'integration_project',
        subject: `New Integration Project Assignment: ${data.projectId}`,
        recipients: [teamMember.id],
        priority: 'high',
        content: {
          title: 'Integration Project Assignment',
          message: `You have been assigned to a new integration project as ${teamMember.role}.`,
          details: {
            projectId: data.projectId,
            providerId: data.providerId,
            role: teamMember.role,
            estimatedCompletion: data.estimatedCompletion,
            teamSize: data.assignedTeam.length
          },
          actions: [
            {
              label: 'View Project',
              url: `/admin/integration-projects/${data.projectId}`
            }
          ]
        }
      });
    }

    // Notify engineering management
    await this.sendInternalNotification({
      type: 'integration_project_started',
      message: `Integration project ${data.projectId} started for provider ${data.providerId}. Team size: ${data.assignedTeam.length}. ETA: ${data.estimatedCompletion}`,
      channel: 'engineering-projects'
    });
  }

  /**
   * Send notification for custom integration request
   */
  async sendCustomIntegrationNotification(
    data: CustomIntegrationNotification
  ): Promise<void> {
    this.logger.info('Sending custom integration notification', {
      integrationId: data.integrationId,
      complexity: data.complexity
    });

    // Escalate complex integrations
    const channel = data.complexity === 'complex'
      ? 'engineering-urgent'
      : 'engineering-projects';

    await this.sendInternalNotification({
      type: 'custom_integration_requested',
      message: `[${data.complexity.toUpperCase()}] Custom integration requested: ${data.integrationId}. Provider: ${data.providerId}. ETA: ${data.estimatedDelivery}`,
      channel
    });

    await this.sendNotification({
      type: 'custom_integration',
      subject: `Custom Integration Request Received - ${data.integrationId}`,
      recipients: [], // Engineering team
      priority: data.complexity === 'complex' ? 'high' : 'medium',
      content: {
        title: 'Custom Integration Request',
        message: `A new custom integration request has been submitted.`,
        details: data,
        actions: [
          {
            label: 'View Integration',
            url: `/admin/integrations/${data.integrationId}`
          },
          {
            label: 'View Service Request',
            url: `/admin/service-requests/${data.serviceRequestId}`
          }
        ]
      }
    });
  }

  /**
   * Send notification for API setup completion
   */
  async sendAPISetupNotification(
    data: APISetupNotification
  ): Promise<void> {
    this.logger.info('Sending API setup notification', {
      providerId: data.providerId,
      apiUrl: data.apiUrl
    });

    await this.sendNotification({
      type: 'api_setup_completed',
      subject: `API Setup Complete - Provider ${data.providerId}`,
      recipients: [], // Provider contacts
      priority: 'high',
      content: {
        title: 'API Setup Completed',
        message: `Your API integration has been set up and is ready for testing.`,
        details: {
          providerId: data.providerId,
          apiUrl: data.apiUrl,
          setupBy: data.setupBy,
          completedAt: new Date().toISOString()
        },
        actions: [
          {
            label: 'View API Documentation',
            url: `/provider/${data.providerId}/api-docs`
          },
          {
            label: 'Test API',
            url: `/provider/${data.providerId}/api-sandbox`
          }
        ]
      }
    });

    // Notify internal team
    await this.sendInternalNotification({
      type: 'api_setup_complete',
      message: `API setup completed for provider ${data.providerId}. URL: ${data.apiUrl}. Setup by: ${data.setupBy}`,
      channel: 'engineering-projects'
    });
  }

  /**
   * Send notification for deployment completion
   */
  async sendDeploymentNotification(
    data: DeploymentNotification
  ): Promise<void> {
    this.logger.info('Sending deployment notification', {
      deploymentId: data.deploymentId,
      version: data.version
    });

    await this.sendInternalNotification({
      type: 'integration_deployed',
      message: `Integration ${data.integrationId} deployed v${data.version}. Deployment ID: ${data.deploymentId}. By: ${data.deployedBy}`,
      channel: 'engineering-deployments'
    });

    await this.sendNotification({
      type: 'deployment_completed',
      subject: `Integration Deployed - Version ${data.version}`,
      recipients: [], // Stakeholders
      priority: 'medium',
      content: {
        title: 'Integration Deployment Complete',
        message: `A new version of your integration has been deployed.`,
        details: data,
        actions: [
          {
            label: 'View Deployment',
            url: `/admin/deployments/${data.deploymentId}`
          },
          {
            label: 'View Changelog',
            url: `/admin/integrations/${data.integrationId}/changelog`
          }
        ]
      }
    });
  }

  // ==================== Private Helper Methods ====================

  /**
   * Core notification sending method
   */
  private async sendNotification(notification: {
    type: string;
    subject: string;
    recipients: string[];
    priority: 'low' | 'medium' | 'high' | 'urgent';
    content: {
      title: string;
      message: string;
      details: unknown;
      actions?: Array<{ label: string; url: string }>;
    };
  }): Promise<void> {
    const notificationRecord: {
      type: string;
      payload: unknown;
      timestamp: string;
      status: 'pending' | 'sent' | 'failed';
    } = {
      type: notification.type,
      payload: notification,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    this.notificationQueue.push(notificationRecord);

    try {
      // Email channel
      if (this.config.email?.enabled && notification.recipients.length > 0) {
        await this.sendEmail(notification);
      }

      // Slack channel
      if (this.config.slack?.enabled) {
        await this.sendSlackMessage(notification);
      }

      // Webhook channel
      if (this.config.webhook?.enabled) {
        await this.sendWebhook(notification);
      }

      notificationRecord.status = 'sent';
      this.logger.debug('Notification sent successfully', {
        type: notification.type,
        recipients: notification.recipients.length
      });
    } catch (error) {
      notificationRecord.status = 'failed';
      this.logger.error('Failed to send notification', {
        type: notification.type,
        error
      });
      throw error;
    }
  }

  /**
   * Send internal notification (Slack, internal systems)
   */
  private async sendInternalNotification(notification: {
    type: string;
    message: string;
    channel: string;
  }): Promise<void> {
    this.logger.debug('Sending internal notification', {
      type: notification.type,
      channel: notification.channel
    });

    // In production, integrate with Slack or internal messaging
    if (this.config.slack?.enabled && this.config.slack?.webhookUrl) {
      // Send to Slack
      this.logger.info('Would send to Slack channel', {
        channel: notification.channel,
        message: notification.message
      });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(notification: {
    subject: string;
    recipients: string[];
    content: {
      title: string;
      message: string;
      details: unknown;
      actions?: Array<{ label: string; url: string }>;
    };
  }): Promise<void> {
    // In production, integrate with email service (SendGrid, SES, etc.)
    this.logger.info('Would send email', {
      subject: notification.subject,
      recipients: notification.recipients,
      title: notification.content.title
    });
  }

  /**
   * Send Slack message
   */
  private async sendSlackMessage(notification: {
    subject: string;
    priority: string;
    content: {
      title: string;
      message: string;
    };
  }): Promise<void> {
    // In production, integrate with Slack API
    this.logger.debug('Would send Slack message', {
      title: notification.subject
    });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(notification: unknown): Promise<void> {
    // In production, send to configured webhook endpoints
    if (this.config.webhook?.endpoints) {
      for (const _endpoint of this.config.webhook.endpoints) {
        this.logger.debug('Would send webhook', {
          endpoint: _endpoint
        });
      }
    }
  }

  /**
   * Get notification queue for debugging/monitoring
   */
  getNotificationQueue(): typeof this.notificationQueue {
    return [...this.notificationQueue];
  }

  /**
   * Clear notification queue
   */
  clearNotificationQueue(): void {
    this.notificationQueue = [];
  }
}
