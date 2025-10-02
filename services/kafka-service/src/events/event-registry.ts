import { v4 as uuidv4 } from 'uuid';

export interface EventMetadata {
  eventId: string;
  eventType: string;
  version: string;
  timestamp: Date;
  source: string;
  correlationId?: string;
  causationId?: string;
}

export interface DomainEvent {
  metadata: EventMetadata;
  data: any;
}

export class EventRegistry {
  private topics: Map<string, string[]> = new Map();
  private eventTypes: Map<string, string> = new Map();

  constructor() {
    this.initializeEventTypes();
    this.initializeTopics();
  }

  private initializeEventTypes() {
    // Credit Application Events
    this.eventTypes.set('CreditApplicationCreated', 'credit-applications');
    this.eventTypes.set('CreditApplicationSubmitted', 'credit-applications');
    this.eventTypes.set('CreditApplicationApproved', 'credit-applications');
    this.eventTypes.set('CreditApplicationRejected', 'credit-applications');
    this.eventTypes.set('CreditApplicationCancelled', 'credit-applications');

    // Risk Assessment Events
    this.eventTypes.set('RiskAssessmentStarted', 'risk-assessments');
    this.eventTypes.set('RiskAssessmentCompleted', 'risk-assessments');
    this.eventTypes.set('RiskScoreUpdated', 'risk-assessments');

    // Compliance Events
    this.eventTypes.set('KycCheckStarted', 'compliance-checks');
    this.eventTypes.set('KycCheckCompleted', 'compliance-checks');
    this.eventTypes.set('AmlCheckStarted', 'compliance-checks');
    this.eventTypes.set('AmlCheckCompleted', 'compliance-checks');

    // Credit Offer Events
    this.eventTypes.set('CreditOfferCreated', 'credit-offers');
    this.eventTypes.set('CreditOfferAccepted', 'credit-offers');
    this.eventTypes.set('CreditOfferRejected', 'credit-offers');
    this.eventTypes.set('CreditOfferExpired', 'credit-offers');

    // Disbursement Events
    this.eventTypes.set('DisbursementInitiated', 'disbursements');
    this.eventTypes.set('DisbursementCompleted', 'disbursements');
    this.eventTypes.set('DisbursementFailed', 'disbursements');

    // Repayment Events
    this.eventTypes.set('RepaymentScheduled', 'repayments');
    this.eventTypes.set('RepaymentProcessed', 'repayments');
    this.eventTypes.set('RepaymentOverdue', 'repayments');

    // Provider Events
    this.eventTypes.set('ProviderRegistered', 'providers');
    this.eventTypes.set('ProviderActivated', 'providers');
    this.eventTypes.set('ProviderDeactivated', 'providers');

    // User Events
    this.eventTypes.set('UserRegistered', 'users');
    this.eventTypes.set('UserProfileUpdated', 'users');
    this.eventTypes.set('UserKycCompleted', 'users');

    // System Events
    this.eventTypes.set('SystemHealthCheck', 'system');
    this.eventTypes.set('ServiceStarted', 'system');
    this.eventTypes.set('ServiceStopped', 'system');
  }

  private initializeTopics() {
    const topics = [
      'credit-applications',
      'risk-assessments',
      'compliance-checks',
      'credit-offers',
      'disbursements',
      'repayments',
      'providers',
      'users',
      'system',
      'audit-logs'
    ];

    topics.forEach(topic => {
      this.topics.set(topic, []);
    });
  }

  getTopicForEventType(eventType: string): string {
    return this.eventTypes.get(eventType) || 'system';
  }

  getTopics(): string[] {
    return Array.from(this.topics.keys());
  }

  createEvent(eventType: string, data: any, source: string, correlationId?: string, causationId?: string): DomainEvent {
    return {
      metadata: {
        eventId: uuidv4(),
        eventType,
        version: '1.0',
        timestamp: new Date(),
        source,
        correlationId,
        causationId
      },
      data
    };
  }

  validateEvent(event: DomainEvent): boolean {
    return !!(
      event.metadata &&
      event.metadata.eventId &&
      event.metadata.eventType &&
      event.metadata.timestamp &&
      event.data !== undefined
    );
  }

  getEventTypes(): string[] {
    return Array.from(this.eventTypes.keys());
  }
}
