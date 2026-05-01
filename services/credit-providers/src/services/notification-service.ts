import { Logger } from '@caas/common';
import {
  CreditProvider,
  LeadStatusUpdate,
  ProviderLoanDecision,
} from '../types/credit-provider';
import type { ProviderLead } from './lead-distribution-service';

export interface NotificationServiceConfig {
  endpoint?: string;
  timeoutMs?: number;
  adminRecipients?: string[];
}

type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

interface NotificationRequest {
  type: string;
  title: string;
  message: string;
  channel: 'loans' | 'payments' | 'admin' | 'system';
  userId?: string;
  roles?: string[];
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  sendEmail?: boolean;
  sendSMS?: boolean;
}

export class NotificationService {
  private endpoint?: string;
  private timeoutMs: number;
  private adminRecipients: string[];

  constructor(
    private logger: Logger,
    config: NotificationServiceConfig = {}
  ) {
    this.endpoint = config.endpoint ?? process.env.NOTIFICATIONS_SERVICE_URL;
    this.timeoutMs = config.timeoutMs ?? 5_000;
    this.adminRecipients = config.adminRecipients ?? ['credit-provider-admin'];
  }

  async sendNotification(
    type: string,
    recipient: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.dispatch({
      type,
      title: data.title?.toString() ?? 'Credit provider notification',
      message: data.message?.toString() ?? 'A credit provider event requires attention.',
      channel: 'system',
      userId: recipient,
      data,
      priority: 'medium',
    });
  }

  async sendRegistrationConfirmation(provider: CreditProvider): Promise<void> {
    await this.dispatch({
      type: 'provider.registration.confirmed',
      title: 'Provider registration received',
      message: `Registration for ${provider.registrationData.companyName} has been received and is pending review.`,
      channel: 'system',
      data: { providerId: provider.id, companyName: provider.registrationData.companyName },
      priority: 'medium',
      sendEmail: true,
    });
  }

  async notifyAdminOfNewRegistration(provider: CreditProvider): Promise<void> {
    await this.dispatch({
      type: 'provider.registration.admin_review',
      title: 'New credit provider registration',
      message: `${provider.registrationData.companyName} is ready for compliance review.`,
      channel: 'admin',
      roles: this.adminRecipients,
      data: { providerId: provider.id, status: provider.status },
      priority: 'high',
    });
  }

  async notifyStatusChange(provider: CreditProvider, previousStatus: string): Promise<void> {
    await this.dispatch({
      type: 'provider.status.changed',
      title: 'Provider status changed',
      message: `${provider.registrationData.companyName} moved from ${previousStatus} to ${provider.status}.`,
      channel: 'admin',
      roles: this.adminRecipients,
      data: { providerId: provider.id, previousStatus, status: provider.status },
      priority: provider.status === 'suspended' ? 'critical' : 'medium',
      sendEmail: provider.status === 'approved' || provider.status === 'suspended',
    });
  }

  async sendApprovalNotification(provider: CreditProvider): Promise<void> {
    await this.dispatch({
      type: 'provider.approved',
      title: 'Provider approved',
      message: `${provider.registrationData.companyName} has been approved for credit lead distribution.`,
      channel: 'system',
      data: { providerId: provider.id, approvedAt: provider.approvedAt },
      priority: 'high',
      sendEmail: true,
    });
  }

  async sendSuspensionNotification(provider: CreditProvider, reason: string): Promise<void> {
    await this.dispatch({
      type: 'provider.suspended',
      title: 'Provider suspended',
      message: `${provider.registrationData.companyName} has been suspended: ${reason}`,
      channel: 'system',
      data: { providerId: provider.id, reason },
      priority: 'critical',
      sendEmail: true,
    });
  }

  async sendCredentialRotationNotification(
    provider: CreditProvider,
    credentials: { apiKey: string; webhookSecret: string }
  ): Promise<void> {
    await this.dispatch({
      type: 'provider.credentials.rotated',
      title: 'API credentials rotated',
      message: `New API credentials were issued for ${provider.registrationData.companyName}.`,
      channel: 'system',
      data: {
        providerId: provider.id,
        apiKeySuffix: credentials.apiKey.slice(-8),
        webhookSecretSuffix: credentials.webhookSecret.slice(-8),
      },
      priority: 'high',
      sendEmail: true,
    });
  }

  async notifyLeadStatusChange(providerLead: ProviderLead, update: LeadStatusUpdate): Promise<void> {
    await this.dispatch({
      type: 'lead.status.changed',
      title: 'Lead status changed',
      message: `Lead ${providerLead.leadId} is now ${update.status}: ${update.statusMessage}`,
      channel: 'loans',
      data: { providerLead, update },
      priority: 'medium',
    });
  }

  async notifyCustomerOfProviderDecision(
    providerLead: ProviderLead,
    decision: ProviderLoanDecision
  ): Promise<void> {
    const approved = decision.decision === 'approved';

    await this.dispatch({
      type: 'provider.decision.customer',
      title: approved ? 'Loan offer received' : 'Loan application update',
      message: approved
        ? `A provider approved ${decision.approvedAmount} for lead ${providerLead.leadId}.`
        : `A provider decision was received for lead ${providerLead.leadId}: ${decision.decision}.`,
      channel: 'loans',
      data: { providerLead, decision },
      priority: approved ? 'high' : 'medium',
      sendEmail: true,
      sendSMS: approved,
    });
  }

  async notifyHighValueLoanDecision(
    providerLead: ProviderLead,
    decision: ProviderLoanDecision
  ): Promise<void> {
    await this.dispatch({
      type: 'provider.decision.high_value',
      title: 'High value loan decision',
      message: `High value approval received for lead ${providerLead.leadId}.`,
      channel: 'admin',
      roles: this.adminRecipients,
      data: { providerLead, decision },
      priority: 'critical',
    });
  }

  private async dispatch(notification: NotificationRequest): Promise<void> {
    if (!this.endpoint) {
      this.logger.info('Notification queued locally', {
        type: notification.type,
        channel: notification.channel,
        title: notification.title,
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint.replace(/\/$/, '')}/api/v1/notifications/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persistToDB: true,
          sendEmail: false,
          sendSMS: false,
          ...notification,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Notification endpoint returned HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn('Notification dispatch failed; event retained in logs', {
        type: notification.type,
        error: error instanceof Error ? error.message : 'Unknown notification error',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
