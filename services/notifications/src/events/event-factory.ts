import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, LoanEvent, PaymentEvent, UserEvent, SystemEvent } from './event-bus';

export class EventFactory {
  private static readonly VERSION = '1.0.0';

  // Loan Events
  public static createLoanSubmitted(data: {
    loanId: string;
    userId: string;
    amount: number;
    source?: string;
  }): LoanEvent {
    return {
      id: uuidv4(),
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

  public static createLoanApproved(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
    source?: string;
  }): LoanEvent {
    return {
      id: uuidv4(),
      type: 'loan.application.approved',
      timestamp: Date.now(),
      source: data.source || 'loan-service',
      version: this.VERSION,
      data: {
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'approved',
        reviewerId: data.reviewerId,
      },
    };
  }

  public static createLoanRejected(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
    reason: string;
    source?: string;
  }): LoanEvent {
    return {
      id: uuidv4(),
      type: 'loan.application.rejected',
      timestamp: Date.now(),
      source: data.source || 'loan-service',
      version: this.VERSION,
      data: {
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'rejected',
        reviewerId: data.reviewerId,
        reason: data.reason,
      },
    };
  }

  public static createLoanReviewed(data: {
    loanId: string;
    userId: string;
    amount: number;
    reviewerId: string;
    source?: string;
  }): LoanEvent {
    return {
      id: uuidv4(),
      type: 'loan.application.reviewed',
      timestamp: Date.now(),
      source: data.source || 'loan-service',
      version: this.VERSION,
      data: {
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'under_review',
        reviewerId: data.reviewerId,
      },
    };
  }

  // Payment Events
  public static createPaymentProcessed(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    method: string;
    source?: string;
  }): PaymentEvent {
    return {
      id: uuidv4(),
      type: 'payment.processed',
      timestamp: Date.now(),
      source: data.source || 'payment-service',
      version: this.VERSION,
      data: {
        paymentId: data.paymentId,
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'completed',
        method: data.method,
      },
    };
  }

  public static createPaymentFailed(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    method?: string;
    error: string;
    source?: string;
  }): PaymentEvent {
    return {
      id: uuidv4(),
      type: 'payment.failed',
      timestamp: Date.now(),
      source: data.source || 'payment-service',
      version: this.VERSION,
      data: {
        paymentId: data.paymentId,
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'failed',
        method: data.method,
        error: data.error,
      },
    };
  }

  public static createPaymentScheduled(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    scheduledDate: Date;
    source?: string;
  }): PaymentEvent {
    return {
      id: uuidv4(),
      type: 'payment.scheduled',
      timestamp: Date.now(),
      source: data.source || 'payment-service',
      version: this.VERSION,
      data: {
        paymentId: data.paymentId,
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'scheduled',
        scheduledDate: data.scheduledDate.getTime(),
      },
    };
  }

  public static createPaymentOverdue(data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    daysOverdue: number;
    source?: string;
  }): PaymentEvent {
    return {
      id: uuidv4(),
      type: 'payment.overdue',
      timestamp: Date.now(),
      source: data.source || 'payment-service',
      version: this.VERSION,
      data: {
        paymentId: data.paymentId,
        loanId: data.loanId,
        userId: data.userId,
        amount: data.amount,
        status: 'overdue',
        daysOverdue: data.daysOverdue,
      },
    };
  }

  // User Events
  public static createUserRegistered(data: {
    userId: string;
    email: string;
    profile?: Record<string, any>;
    source?: string;
  }): UserEvent {
    return {
      id: uuidv4(),
      type: 'user.registered',
      timestamp: Date.now(),
      source: data.source || 'user-service',
      version: this.VERSION,
      data: {
        userId: data.userId,
        email: data.email,
        profile: data.profile,
      },
    };
  }

  public static createUserVerified(data: {
    userId: string;
    email: string;
    verificationType: string;
    source?: string;
  }): UserEvent {
    return {
      id: uuidv4(),
      type: 'user.verified',
      timestamp: Date.now(),
      source: data.source || 'user-service',
      version: this.VERSION,
      data: {
        userId: data.userId,
        email: data.email,
        verificationType: data.verificationType,
      },
    };
  }

  public static createUserProfileUpdated(data: {
    userId: string;
    email: string;
    changes: Record<string, any>;
    source?: string;
  }): UserEvent {
    return {
      id: uuidv4(),
      type: 'user.profile.updated',
      timestamp: Date.now(),
      source: data.source || 'user-service',
      version: this.VERSION,
      data: {
        userId: data.userId,
        email: data.email,
        changes: data.changes,
      },
    };
  }

  public static createUserDeactivated(data: {
    userId: string;
    email: string;
    reason?: string;
    source?: string;
  }): UserEvent {
    return {
      id: uuidv4(),
      type: 'user.deactivated',
      timestamp: Date.now(),
      source: data.source || 'user-service',
      version: this.VERSION,
      data: {
        userId: data.userId,
        email: data.email,
        reason: data.reason,
      },
    };
  }

  // System Events
  public static createSystemMaintenance(data: {
    message: string;
    component?: string;
    startTime: Date;
    endTime: Date;
    source?: string;
  }): SystemEvent {
    return {
      id: uuidv4(),
      type: 'system.maintenance',
      timestamp: Date.now(),
      source: data.source || 'system',
      version: this.VERSION,
      data: {
        severity: 'medium' as const,
        message: data.message,
        component: data.component,
        startTime: data.startTime.getTime(),
        endTime: data.endTime.getTime(),
      },
    };
  }

  public static createSystemAlert(data: {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    component?: string;
    metrics?: Record<string, any>;
    source?: string;
  }): SystemEvent {
    return {
      id: uuidv4(),
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

  public static createSystemError(data: {
    message: string;
    component?: string;
    error: any;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    source?: string;
  }): SystemEvent {
    return {
      id: uuidv4(),
      type: 'system.error',
      timestamp: Date.now(),
      source: data.source || 'system',
      version: this.VERSION,
      data: {
        severity: data.severity || 'high',
        message: data.message,
        component: data.component,
        error: data.error,
      },
    };
  }

  public static createSystemPerformance(data: {
    component: string;
    metrics: Record<string, any>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    source?: string;
  }): SystemEvent {
    return {
      id: uuidv4(),
      type: 'system.performance',
      timestamp: Date.now(),
      source: data.source || 'system',
      version: this.VERSION,
      data: {
        severity: data.severity || 'low',
        message: `Performance metrics for ${data.component}`,
        component: data.component,
        metrics: data.metrics,
      },
    };
  }
}