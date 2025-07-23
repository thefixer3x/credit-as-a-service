import { EventEmitter } from 'events';
import { WebSocketManager } from '../realtime/websocket-server';

export interface BaseEvent {
  id: string;
  type: string;
  timestamp: number;
  source: string;
  version: string;
  data: Record<string, any>;
}

export interface LoanEvent extends BaseEvent {
  type: 'loan.application.submitted' | 'loan.application.approved' | 'loan.application.rejected' | 'loan.application.reviewed';
  data: {
    loanId: string;
    userId: string;
    amount: number;
    status: string;
    reviewerId?: string;
    reason?: string;
  };
}

export interface PaymentEvent extends BaseEvent {
  type: 'payment.processed' | 'payment.failed' | 'payment.scheduled' | 'payment.overdue';
  data: {
    paymentId: string;
    loanId: string;
    userId: string;
    amount: number;
    status: string;
    method?: string;
    error?: string;
  };
}

export interface UserEvent extends BaseEvent {
  type: 'user.registered' | 'user.verified' | 'user.profile.updated' | 'user.deactivated';
  data: {
    userId: string;
    email: string;
    profile?: Record<string, any>;
    changes?: Record<string, any>;
  };
}

export interface SystemEvent extends BaseEvent {
  type: 'system.maintenance' | 'system.alert' | 'system.error' | 'system.performance';
  data: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    component?: string;
    metrics?: Record<string, any>;
    error?: any;
  };
}

export type DomainEvent = LoanEvent | PaymentEvent | UserEvent | SystemEvent;

export class EventBus extends EventEmitter {
  private static instance: EventBus;
  private wsManager: WebSocketManager | null = null;
  private eventStore: DomainEvent[] = [];
  private maxStoreSize = 1000;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public setWebSocketManager(wsManager: WebSocketManager): void {
    this.wsManager = wsManager;
    console.log('🔗 EventBus connected to WebSocket manager');
  }

  public async publish(event: DomainEvent): Promise<void> {
    try {
      // Store event
      this.storeEvent(event);

      // Emit to local listeners
      this.emit(event.type, event);
      this.emit('*', event);

      // Send via WebSocket if available
      if (this.wsManager) {
        await this.sendWebSocketNotification(event);
      }

      console.log(`📡 Event published: ${event.type}`, {
        id: event.id,
        source: event.source,
        timestamp: event.timestamp,
      });
    } catch (error) {
      console.error('❌ Failed to publish event:', error);
      throw error;
    }
  }

  public subscribe(eventType: string | string[], handler: (event: DomainEvent) => void): void {
    if (Array.isArray(eventType)) {
      eventType.forEach(type => this.on(type, handler));
    } else {
      this.on(eventType, handler);
    }
  }

  public unsubscribe(eventType: string | string[], handler: (event: DomainEvent) => void): void {
    if (Array.isArray(eventType)) {
      eventType.forEach(type => this.off(type, handler));
    } else {
      this.off(eventType, handler);
    }
  }

  public getEvents(filter?: {
    type?: string;
    source?: string;
    since?: number;
    limit?: number;
  }): DomainEvent[] {
    let events = [...this.eventStore];

    if (filter) {
      if (filter.type) {
        events = events.filter(e => e.type === filter.type || e.type.startsWith(filter.type + '.'));
      }
      
      if (filter.source) {
        events = events.filter(e => e.source === filter.source);
      }
      
      if (filter.since) {
        events = events.filter(e => e.timestamp >= filter.since!);
      }
      
      if (filter.limit) {
        events = events.slice(-filter.limit);
      }
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getEventStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySource: Record<string, number>;
    recentEvents: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const eventsByType: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    let recentEvents = 0;

    this.eventStore.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      
      if (event.timestamp >= oneHourAgo) {
        recentEvents++;
      }
    });

    return {
      totalEvents: this.eventStore.length,
      eventsByType,
      eventsBySource,
      recentEvents,
    };
  }

  private storeEvent(event: DomainEvent): void {
    this.eventStore.push(event);
    
    // Trim store if it gets too large
    if (this.eventStore.length > this.maxStoreSize) {
      this.eventStore = this.eventStore.slice(-this.maxStoreSize);
    }
  }

  private async sendWebSocketNotification(event: DomainEvent): Promise<void> {
    if (!this.wsManager) return;

    const notification = this.mapEventToNotification(event);
    if (notification) {
      this.wsManager.sendNotification(notification);
    }
  }

  private mapEventToNotification(event: DomainEvent): any | null {
    const baseNotification = {
      id: `notif_${event.id}`,
      timestamp: event.timestamp,
      data: event.data,
    };

    switch (event.type) {
      case 'loan.application.submitted':
        return {
          ...baseNotification,
          type: 'loan_submitted',
          title: 'Loan Application Submitted',
          message: `Your loan application for $${event.data.amount.toLocaleString()} has been submitted`,
          channel: 'loans',
          priority: 'medium',
          recipients: [event.data.userId],
        };

      case 'loan.application.approved':
        return {
          ...baseNotification,
          type: 'loan_approved',
          title: 'Loan Approved! 🎉',
          message: `Your loan application for $${event.data.amount.toLocaleString()} has been approved`,
          channel: 'loans',
          priority: 'high',
          recipients: [event.data.userId],
        };

      case 'loan.application.rejected':
        return {
          ...baseNotification,
          type: 'loan_rejected',
          title: 'Loan Application Update',
          message: `Your loan application has been reviewed. ${event.data.reason || 'Please contact support for details.'}`,
          channel: 'loans',
          priority: 'medium',
          recipients: [event.data.userId],
        };

      case 'payment.processed':
        return {
          ...baseNotification,
          type: 'payment_successful',
          title: 'Payment Processed',
          message: `Payment of $${event.data.amount.toLocaleString()} has been successfully processed`,
          channel: 'payments',
          priority: 'medium',
          recipients: [event.data.userId],
        };

      case 'payment.failed':
        return {
          ...baseNotification,
          type: 'payment_failed',
          title: 'Payment Failed',
          message: `Payment of $${event.data.amount.toLocaleString()} could not be processed. ${event.data.error || ''}`,
          channel: 'payments',
          priority: 'high',
          recipients: [event.data.userId],
        };

      case 'payment.overdue':
        return {
          ...baseNotification,
          type: 'payment_overdue',
          title: 'Payment Overdue',
          message: `Payment of $${event.data.amount.toLocaleString()} is now overdue. Please make a payment to avoid penalties.`,
          channel: 'payments',
          priority: 'critical',
          recipients: [event.data.userId],
        };

      case 'system.alert':
        return {
          ...baseNotification,
          type: 'admin_alert',
          title: 'System Alert',
          message: event.data.message,
          channel: 'system',
          priority: event.data.severity === 'critical' ? 'critical' : 'high',
          roles: ['admin', 'manager'],
        };

      case 'user.registered':
        return {
          ...baseNotification,
          type: 'user_registered',
          title: 'Welcome to Credit-as-a-Service! 👋',
          message: 'Your account has been successfully created. You can now apply for loans.',
          channel: 'system',
          priority: 'medium',
          recipients: [event.data.userId],
        };

      default:
        return null;
    }
  }
}

export const eventBus = EventBus.getInstance();