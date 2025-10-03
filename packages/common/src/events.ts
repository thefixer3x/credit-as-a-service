// Note: EventFactory would typically be imported from the notifications service
// For now, we'll create a simplified version here to avoid circular dependencies

// Simplified EventFactory for common package
export class EventFactory {
  private static readonly VERSION = '1.0.0';

  public static createLoanSubmitted(data: {
    loanId: string;
    userId: string;
    amount: number;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'loan.application.submitted',
      timestamp: Date.now(),
      source: data.source || 'loan-service',
      version: this.VERSION,
      data: {
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'submitted',
      },
    };
  }

  public static createSystemAlert(data: {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    component?: string;
    metrics?: Record<string, any>;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'system.alert',
      timestamp: Date.now(),
      source: data.source || 'system',
      version: this.VERSION,
      data: {
        severity: data.severity,
        message: data.message,
        component: data.component,
        metrics: data.metrics,
      },
    };
  }

  public static createLoanApproved(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'loan.application.approved',
      timestamp: Date.now(),
      source: data.source || 'underwriting-service',
      version: this.VERSION,
      data: {
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        reviewerId: data.reviewerId,
        status: 'approved',
      },
    };
  }

  public static createLoanRejected(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
    reason?: string;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'loan.application.rejected',
      timestamp: Date.now(),
      source: data.source || 'underwriting-service',
      version: this.VERSION,
      data: {
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        reviewerId: data.reviewerId,
        reason: data.reason,
        status: 'rejected',
      },
    };
  }

  public static createPaymentProcessed(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'payment.processed',
      timestamp: Date.now(),
      source: data.source || 'repayment-service',
      version: this.VERSION,
      data: {
        paymentId: data.paymentId,
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'processed',
      },
    };
  }

  public static createPaymentFailed(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    reason?: string;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'payment.failed',
      timestamp: Date.now(),
      source: data.source || 'repayment-service',
      version: this.VERSION,
      data: {
        paymentId: data.paymentId,
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        reason: data.reason,
        status: 'failed',
      },
    };
  }

  public static createUserRegistered(data: {
    userId: string;
    email: string;
    source?: string;
  }) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user.registered',
      timestamp: Date.now(),
      source: data.source || 'auth-service',
      version: this.VERSION,
      data: {
        userId: data.userId,
        email: data.email,
        status: 'active',
      },
    };
  }
}

// Utility function for publishing events from any service
export async function publishEvent(eventData: any, serviceUrl?: string): Promise<void> {
  const url = serviceUrl || process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3009';
  
  try {
    const response = await fetch(`${url}/api/v1/events/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      throw new Error(`Failed to publish event: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error publishing event:', error);
    throw error;
  }
}

// Helper functions for common event publishing
export class EventPublisher {
  private serviceUrl: string;

  constructor(serviceUrl?: string) {
    this.serviceUrl = serviceUrl || process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3009';
  }

  async publishLoanSubmitted(data: {
    loanId: string;
    userId: string;
    amount: number;
  }): Promise<void> {
    const event = EventFactory.createLoanSubmitted({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }

  async publishLoanApproved(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
  }): Promise<void> {
    const event = EventFactory.createLoanApproved({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }

  async publishLoanRejected(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
    reason: string;
  }): Promise<void> {
    const event = EventFactory.createLoanRejected({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }

  async publishPaymentProcessed(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    method: string;
  }): Promise<void> {
    const event = EventFactory.createPaymentProcessed({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }

  async publishPaymentFailed(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    method?: string;
    error: string;
  }): Promise<void> {
    const event = EventFactory.createPaymentFailed({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }

  async publishUserRegistered(data: {
    userId: string;
    email: string;
    profile?: Record<string, any>;
  }): Promise<void> {
    const event = EventFactory.createUserRegistered({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }

  async publishSystemAlert(data: {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    component?: string;
    metrics?: Record<string, any>;
  }): Promise<void> {
    const event = EventFactory.createSystemAlert({
      ...data,
      source: process.env.SERVICE_NAME || 'unknown-service',
    });
    return publishEvent(event, this.serviceUrl);
  }
}

// Default instance
export const eventPublisher = new EventPublisher();