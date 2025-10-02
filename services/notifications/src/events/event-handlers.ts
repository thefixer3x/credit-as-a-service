import { DomainEvent, LoanEvent, PaymentEvent, UserEvent, SystemEvent } from './event-bus';

export interface EventHandler {
  name: string;
  eventTypes: string[];
  handle(event: DomainEvent): Promise<void>;
}

export class LoanEventHandler implements EventHandler {
  name = 'LoanEventHandler';
  eventTypes = ['loan.application.submitted', 'loan.application.approved', 'loan.application.rejected', 'loan.application.reviewed'];

  async handle(event: LoanEvent): Promise<void> {
    console.log(`🏦 Processing loan event: ${event.type}`, {
      loanId: event.data.loanId,
      userId: event.data.userId,
      amount: event.data.amount,
    });

    switch (event.type) {
      case 'loan.application.submitted':
        await this.handleLoanSubmission(event);
        break;
      case 'loan.application.approved':
        await this.handleLoanApproval(event);
        break;
      case 'loan.application.rejected':
        await this.handleLoanRejection(event);
        break;
      case 'loan.application.reviewed':
        await this.handleLoanReview(event);
        break;
    }
  }

  private async handleLoanSubmission(event: LoanEvent): Promise<void> {
    // Update loan status in database
    // Trigger risk assessment workflow
    // Notify admin team
    console.log(`📋 Loan ${event.data.loanId} submitted for review`);
    
    // Here you would integrate with your database service
    // Example: await loanService.updateStatus(event.data.loanId, 'under_review');
  }

  private async handleLoanApproval(event: LoanEvent): Promise<void> {
    // Update loan status
    // Set up payment schedule
    // Send approval documents
    console.log(`✅ Loan ${event.data.loanId} approved for user ${event.data.userId}`);
    
    // Example integrations:
    // await loanService.approve(event.data.loanId);
    // await paymentService.createSchedule(event.data.loanId, event.data.amount);
    // await documentService.generateApprovalDocs(event.data.loanId);
  }

  private async handleLoanRejection(event: LoanEvent): Promise<void> {
    // Update loan status
    // Log rejection reason
    // Update user's credit profile
    console.log(`❌ Loan ${event.data.loanId} rejected: ${event.data.reason}`);
    
    // Example integrations:
    // await loanService.reject(event.data.loanId, event.data.reason);
    // await userService.updateCreditProfile(event.data.userId, 'rejection');
  }

  private async handleLoanReview(event: LoanEvent): Promise<void> {
    // Update review status
    // Assign to reviewer
    // Set review deadline
    console.log(`👁️ Loan ${event.data.loanId} assigned for review to ${event.data.reviewerId}`);
  }
}

export class PaymentEventHandler implements EventHandler {
  name = 'PaymentEventHandler';
  eventTypes = ['payment.processed', 'payment.failed', 'payment.scheduled', 'payment.overdue'];

  async handle(event: PaymentEvent): Promise<void> {
    console.log(`💳 Processing payment event: ${event.type}`, {
      paymentId: event.data.paymentId,
      loanId: event.data.loanId,
      amount: event.data.amount,
    });

    switch (event.type) {
      case 'payment.processed':
        await this.handlePaymentSuccess(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailure(event);
        break;
      case 'payment.scheduled':
        await this.handlePaymentScheduled(event);
        break;
      case 'payment.overdue':
        await this.handlePaymentOverdue(event);
        break;
    }
  }

  private async handlePaymentSuccess(event: PaymentEvent): Promise<void> {
    // Update payment status
    // Update loan balance
    // Generate receipt
    console.log(`✅ Payment ${event.data.paymentId} processed successfully`);
    
    // Example integrations:
    // await paymentService.markAsPaid(event.data.paymentId);
    // await loanService.updateBalance(event.data.loanId, -event.data.amount);
    // await receiptService.generate(event.data.paymentId);
  }

  private async handlePaymentFailure(event: PaymentEvent): Promise<void> {
    // Update payment status
    // Schedule retry
    // Notify user
    console.log(`❌ Payment ${event.data.paymentId} failed: ${event.data.error}`);
    
    // Example integrations:
    // await paymentService.markAsFailed(event.data.paymentId, event.data.error);
    // await paymentService.scheduleRetry(event.data.paymentId);
  }

  private async handlePaymentScheduled(event: PaymentEvent): Promise<void> {
    // Set up automated payment
    // Send reminder notifications
    console.log(`📅 Payment ${event.data.paymentId} scheduled`);
  }

  private async handlePaymentOverdue(event: PaymentEvent): Promise<void> {
    // Apply late fees
    // Update credit score
    // Escalate to collections
    console.log(`⏰ Payment ${event.data.paymentId} is overdue`);
    
    // Example integrations:
    // await feeService.applyLateFee(event.data.loanId);
    // await creditService.reportLateness(event.data.userId);
  }
}

export class UserEventHandler implements EventHandler {
  name = 'UserEventHandler';
  eventTypes = ['user.registered', 'user.verified', 'user.profile.updated', 'user.deactivated'];

  async handle(event: UserEvent): Promise<void> {
    console.log(`👤 Processing user event: ${event.type}`, {
      userId: event.data.userId,
      email: event.data.email,
    });

    switch (event.type) {
      case 'user.registered':
        await this.handleUserRegistration(event);
        break;
      case 'user.verified':
        await this.handleUserVerification(event);
        break;
      case 'user.profile.updated':
        await this.handleProfileUpdate(event);
        break;
      case 'user.deactivated':
        await this.handleUserDeactivation(event);
        break;
    }
  }

  private async handleUserRegistration(event: UserEvent): Promise<void> {
    // Send welcome email
    // Create user profile
    // Set up initial credit profile
    console.log(`🎉 New user registered: ${event.data.email}`);
    
    // Example integrations:
    // await emailService.sendWelcome(event.data.email);
    // await creditService.initializeProfile(event.data.userId);
  }

  private async handleUserVerification(event: UserEvent): Promise<void> {
    // Update verification status
    // Enable loan applications
    console.log(`✅ User verified: ${event.data.userId}`);
  }

  private async handleProfileUpdate(event: UserEvent): Promise<void> {
    // Validate profile changes
    // Update credit assessment if needed
    console.log(`📝 Profile updated for user: ${event.data.userId}`);
  }

  private async handleUserDeactivation(event: UserEvent): Promise<void> {
    // Suspend active loans
    // Archive user data
    console.log(`❌ User deactivated: ${event.data.userId}`);
  }
}

export class SystemEventHandler implements EventHandler {
  name = 'SystemEventHandler';
  eventTypes = ['system.maintenance', 'system.alert', 'system.error', 'system.performance'];

  async handle(event: SystemEvent): Promise<void> {
    console.log(`🔧 Processing system event: ${event.type}`, {
      severity: event.data.severity,
      component: event.data.component,
    });

    switch (event.type) {
      case 'system.maintenance':
        await this.handleMaintenance(event);
        break;
      case 'system.alert':
        await this.handleAlert(event);
        break;
      case 'system.error':
        await this.handleError(event);
        break;
      case 'system.performance':
        await this.handlePerformance(event);
        break;
    }
  }

  private async handleMaintenance(event: SystemEvent): Promise<void> {
    // Notify users of maintenance
    // Update status page
    console.log(`🔧 System maintenance: ${event.data.message}`);
  }

  private async handleAlert(event: SystemEvent): Promise<void> {
    // Escalate based on severity
    // Notify operations team
    console.log(`🚨 System alert (${event.data.severity}): ${event.data.message}`);
    
    if (event.data.severity === 'critical') {
      // Immediate escalation
      // await operationsService.escalateToCritical(event);
    }
  }

  private async handleError(event: SystemEvent): Promise<void> {
    // Log error details
    // Create incident if needed
    console.log(`❌ System error: ${event.data.message}`);
    
    // Example integrations:
    // await logService.logError(event.data.error);
    // await incidentService.createIfNeeded(event);
  }

  private async handlePerformance(event: SystemEvent): Promise<void> {
    // Store metrics
    // Check thresholds
    // Auto-scale if needed
    console.log(`📊 Performance metrics: ${event.data.component}`);
  }
}

export class EventHandlerRegistry {
  private handlers: Map<string, EventHandler[]> = new Map();

  public register(handler: EventHandler): void {
    handler.eventTypes.forEach(eventType => {
      if (!this.handlers.has(eventType)) {
        this.handlers.set(eventType, []);
      }
      this.handlers.get(eventType)!.push(handler);
    });
    
    console.log(`📝 Registered handler: ${handler.name} for events: ${handler.eventTypes.join(', ')}`);
  }

  public async handle(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    
    if (handlers.length === 0) {
      console.log(`⚠️ No handlers found for event type: ${event.type}`);
      return;
    }

    const promises = handlers.map(async handler => {
      try {
        await handler.handle(event);
      } catch (error) {
        console.error(`❌ Handler ${handler.name} failed for event ${event.type}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  public getHandlers(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    
    this.handlers.forEach((handlers, eventType) => {
      result[eventType] = handlers.map(h => h.name);
    });
    
    return result;
  }
}

export const eventHandlerRegistry = new EventHandlerRegistry();

// Register default handlers
eventHandlerRegistry.register(new LoanEventHandler());
eventHandlerRegistry.register(new PaymentEventHandler());
eventHandlerRegistry.register(new UserEventHandler());
eventHandlerRegistry.register(new SystemEventHandler());