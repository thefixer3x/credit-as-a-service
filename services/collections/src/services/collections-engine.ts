import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

import { validateEnv } from '@caas/config';
import { CacheService } from '@caas/cache';

import type {
  DelinquencyCase,
  CollectionAction,
  HardshipPlan,
  PaymentPromise,
  CollectionStrategy,
  CollectionAgent,
  DisputeCase,
  LegalReferral,
  CollectionAnalytics,
  CollectionEvent,
  CollectionSettings
} from '../types/collections.js';

const logger = pino({ name: 'collections-engine' });
const env = validateEnv();

export class CollectionsEngine {
  private cache: CacheService;
  private settings: CollectionSettings;
  private cronJobs: Map<string, any> = new Map();

  constructor(cache: CacheService) {
    this.cache = cache;
    this.initializeSettings();
    this.startScheduledJobs();
  }

  /**
   * Create delinquency case
   */
  async createDelinquencyCase(
    userId: string,
    creditApplicationId: string,
    repaymentScheduleId: string,
    daysPastDue: number,
    outstandingAmount: number,
    overdueAmount: number
  ): Promise<DelinquencyCase> {
    try {
      const caseId = uuidv4();
      const severity = this.calculateSeverity(daysPastDue, overdueAmount);
      const priority = this.calculatePriority(severity, outstandingAmount);

      const delinquencyCase: DelinquencyCase = {
        id: caseId,
        userId,
        creditApplicationId,
        repaymentScheduleId,
        status: daysPastDue <= 30 ? 'early_delinquency' : 'delinquent',
        severity,
        daysPastDue,
        outstandingAmount,
        overdueAmount,
        lateFees: this.calculateLateFees(overdueAmount, daysPastDue),
        totalOwed: outstandingAmount + this.calculateLateFees(overdueAmount, daysPastDue),
        firstMissedPaymentDate: new Date(Date.now() - (daysPastDue * 24 * 60 * 60 * 1000)),
        nextActionDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
        escalationLevel: 1,
        priority,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save case
      await this.saveCase(delinquencyCase);

      // Auto-assign to agent if enabled
      if (this.settings.autoAssignmentEnabled) {
        await this.autoAssignCase(caseId);
      }

      // Trigger initial collection strategy
      await this.initiateCollectionStrategy(caseId, this.settings.defaultStrategy);

      // Create event
      await this.createEvent('case_created', caseId, userId, {
        severity,
        daysPastDue,
        overdueAmount
      });

      logger.info({
        caseId,
        userId,
        daysPastDue,
        overdueAmount,
        severity
      }, 'Delinquency case created');

      return delinquencyCase;
    } catch (error) {
      logger.error({ error, userId, creditApplicationId }, 'Failed to create delinquency case');
      throw error;
    }
  }

  /**
   * Create collection action
   */
  async createCollectionAction(
    caseId: string,
    type: CollectionAction['type'],
    channel: CollectionAction['channel'],
    scheduledFor: Date,
    agentId?: string,
    notes: string = ''
  ): Promise<CollectionAction> {
    try {
      const actionId = uuidv4();

      const action: CollectionAction = {
        id: actionId,
        caseId,
        type,
        status: 'pending',
        channel,
        priority: 'medium',
        scheduledFor,
        outcome: 'other',
        agentId,
        agentName: agentId ? await this.getAgentName(agentId) : undefined,
        notes,
        followUpRequired: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save action
      await this.cache.set(`action:${actionId}`, action, 86400 * 30);
      
      // Add to case actions list
      await this.addActionToCase(caseId, actionId);

      logger.info({
        actionId,
        caseId,
        type,
        channel,
        scheduledFor
      }, 'Collection action created');

      return action;
    } catch (error) {
      logger.error({ error, caseId }, 'Failed to create collection action');
      throw error;
    }
  }

  /**
   * Complete collection action
   */
  async completeCollectionAction(
    actionId: string,
    outcome: CollectionAction['outcome'],
    notes: string,
    followUpRequired: boolean = false,
    followUpDate?: Date
  ): Promise<CollectionAction> {
    try {
      const action = await this.getAction(actionId);
      if (!action) {
        throw new Error('Collection action not found');
      }

      action.status = 'completed';
      action.outcome = outcome;
      action.notes = notes;
      action.followUpRequired = followUpRequired;
      action.followUpDate = followUpDate;
      action.completedAt = new Date();
      action.updatedAt = new Date();

      await this.cache.set(`action:${actionId}`, action, 86400 * 30);

      // Update case based on outcome
      await this.processActionOutcome(action);

      // Create event
      await this.createEvent('action_completed', action.caseId, '', {
        actionId,
        type: action.type,
        outcome,
        followUpRequired
      });

      logger.info({
        actionId,
        caseId: action.caseId,
        outcome,
        followUpRequired
      }, 'Collection action completed');

      return action;
    } catch (error) {
      logger.error({ error, actionId }, 'Failed to complete collection action');
      throw error;
    }
  }

  /**
   * Create hardship plan
   */
  async createHardshipPlan(
    caseId: string,
    userId: string,
    type: HardshipPlan['type'],
    reason: string,
    proposedTerms: HardshipPlan['proposedTerms'],
    requestedBy: 'user' | 'agent' | 'system' = 'user'
  ): Promise<HardshipPlan> {
    try {
      const planId = uuidv4();
      const delinquencyCase = await this.getCase(caseId);
      
      if (!delinquencyCase) {
        throw new Error('Delinquency case not found');
      }

      const hardshipPlan: HardshipPlan = {
        id: planId,
        caseId,
        userId,
        type,
        reason,
        requestedBy,
        status: 'pending',
        originalDebt: delinquencyCase.totalOwed,
        proposedTerms,
        complianceRequirements: this.getComplianceRequirements(type),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save hardship plan
      await this.cache.set(`hardshipplan:${planId}`, hardshipPlan, 86400 * 30);

      // Update case with hardship plan
      await this.addHardshipPlanToCase(caseId, planId);

      // Create event
      await this.createEvent('hardship_requested', caseId, userId, {
        planId,
        type,
        requestedBy
      });

      logger.info({
        planId,
        caseId,
        type,
        requestedBy
      }, 'Hardship plan created');

      return hardshipPlan;
    } catch (error) {
      logger.error({ error, caseId, userId }, 'Failed to create hardship plan');
      throw error;
    }
  }

  /**
   * Record payment promise
   */
  async recordPaymentPromise(
    caseId: string,
    userId: string,
    promisedAmount: number,
    promisedDate: Date,
    promiseType: PaymentPromise['promiseType'],
    actionId?: string,
    agentId?: string
  ): Promise<PaymentPromise> {
    try {
      const promiseId = uuidv4();

      const promise: PaymentPromise = {
        id: promiseId,
        caseId,
        userId,
        actionId,
        promisedAmount,
        promisedDate,
        status: 'pending',
        promiseType,
        keeperScore: await this.calculatePromiseKeeperScore(userId),
        agentId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save promise
      await this.cache.set(`promise:${promiseId}`, promise, 86400 * 30);

      // Add to case promises
      await this.addPromiseToCase(caseId, promiseId);

      // Schedule follow-up
      await this.schedulePromiseFollowUp(promiseId, promisedDate);

      // Create event
      await this.createEvent('promise_made', caseId, userId, {
        promiseId,
        promisedAmount,
        promisedDate: promisedDate.toISOString(),
        promiseType
      });

      logger.info({
        promiseId,
        caseId,
        promisedAmount,
        promisedDate
      }, 'Payment promise recorded');

      return promise;
    } catch (error) {
      logger.error({ error, caseId, userId }, 'Failed to record payment promise');
      throw error;
    }
  }

  /**
   * Create dispute case
   */
  async createDisputeCase(
    caseId: string,
    userId: string,
    type: DisputeCase['type'],
    description: string,
    claimedAmount?: number,
    supportingEvidence?: string[]
  ): Promise<DisputeCase> {
    try {
      const disputeId = uuidv4();

      const dispute: DisputeCase = {
        id: disputeId,
        caseId,
        userId,
        type,
        status: 'pending',
        description,
        claimedAmount,
        supportingEvidence,
        timelineEvents: [{
          date: new Date(),
          event: 'Dispute created',
          details: description,
          performedBy: userId
        }],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save dispute
      await this.cache.set(`dispute:${disputeId}`, dispute, 86400 * 30);

      // Pause collection activities for this case
      await this.pauseCollectionActivities(caseId, 'dispute_under_investigation');

      // Create event
      await this.createEvent('dispute_raised', caseId, userId, {
        disputeId,
        type,
        claimedAmount
      });

      logger.info({
        disputeId,
        caseId,
        type,
        claimedAmount
      }, 'Dispute case created');

      return dispute;
    } catch (error) {
      logger.error({ error, caseId, userId }, 'Failed to create dispute case');
      throw error;
    }
  }

  /**
   * Create legal referral
   */
  async createLegalReferral(
    caseId: string,
    userId: string,
    referredBy: string,
    referralReason: string,
    debtAmount: number
  ): Promise<LegalReferral> {
    try {
      const referralId = uuidv4();

      const referral: LegalReferral = {
        id: referralId,
        caseId,
        userId,
        referredBy,
        referralReason,
        debtAmount,
        status: 'pending',
        referralDate: new Date(),
        milestones: [{
          date: new Date(),
          milestone: 'Legal referral created',
          details: referralReason
        }],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save referral
      await this.cache.set(`legalreferral:${referralId}`, referral, 86400 * 90);

      // Update case status
      const delinquencyCase = await this.getCase(caseId);
      if (delinquencyCase) {
        delinquencyCase.status = 'default';
        delinquencyCase.escalationLevel = 999; // Max escalation
        await this.saveCase(delinquencyCase);
      }

      // Create event
      await this.createEvent('legal_referred', caseId, userId, {
        referralId,
        debtAmount,
        referralReason
      });

      logger.info({
        referralId,
        caseId,
        debtAmount,
        referralReason
      }, 'Legal referral created');

      return referral;
    } catch (error) {
      logger.error({ error, caseId, userId }, 'Failed to create legal referral');
      throw error;
    }
  }

  /**
   * Generate analytics
   */
  async generateAnalytics(period: string = 'current_month'): Promise<CollectionAnalytics> {
    try {
      // In production, this would query the database for actual metrics
      // For now, return mock analytics
      const analytics: CollectionAnalytics = {
        period,
        totalCases: 150,
        newCases: 25,
        resolvedCases: 35,
        totalDebtUnderCollection: 2500000,
        amountRecovered: 450000,
        recoveryRate: 0.18,
        averageResolutionDays: 45,
        contactRate: 0.72,
        promiseRate: 0.45,
        promiseKeepingRate: 0.68,
        costPerCase: 125,
        agentUtilization: 0.82,
        customerComplaintRate: 0.03,
        legalReferralRate: 0.08,
        writeOffRate: 0.05,
        caseDistribution: {
          byStatus: {
            'early_delinquency': 45,
            'delinquent': 65,
            'default': 25,
            'resolved': 35,
            'written_off': 8
          },
          bySeverity: {
            'low': 50,
            'medium': 70,
            'high': 25,
            'critical': 5
          },
          byAgent: {},
          byStrategy: {},
          byOutcome: {}
        },
        trends: {
          recoveryTrend: [],
          volumeTrend: [],
          efficiencyTrend: []
        },
        compliance: {
          callVolumeCompliance: true,
          timingCompliance: true,
          documentationCompliance: 0.95,
          disputeResponseTime: 2.5
        }
      };

      return analytics;
    } catch (error) {
      logger.error({ error }, 'Failed to generate analytics');
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private calculateSeverity(daysPastDue: number, overdueAmount: number): DelinquencyCase['severity'] {
    if (daysPastDue >= 90 || overdueAmount >= 100000) return 'critical';
    if (daysPastDue >= 60 || overdueAmount >= 50000) return 'high';
    if (daysPastDue >= 30 || overdueAmount >= 20000) return 'medium';
    return 'low';
  }

  private calculatePriority(severity: DelinquencyCase['severity'], amount: number): DelinquencyCase['priority'] {
    if (severity === 'critical' || amount >= 100000) return 'urgent';
    if (severity === 'high' || amount >= 50000) return 'high';
    if (severity === 'medium' || amount >= 20000) return 'medium';
    return 'low';
  }

  private calculateLateFees(overdueAmount: number, daysPastDue: number): number {
    const lateFeeRate = 0.025; // 2.5% monthly
    const monthsPastDue = Math.ceil(daysPastDue / 30);
    return overdueAmount * lateFeeRate * monthsPastDue;
  }

  private async saveCase(delinquencyCase: DelinquencyCase): Promise<void> {
    delinquencyCase.updatedAt = new Date();
    await this.cache.set(`case:${delinquencyCase.id}`, delinquencyCase, 86400 * 90);
  }

  private async getCase(caseId: string): Promise<DelinquencyCase | null> {
    return await this.cache.get<DelinquencyCase>(`case:${caseId}`);
  }

  private async getAction(actionId: string): Promise<CollectionAction | null> {
    return await this.cache.get<CollectionAction>(`action:${actionId}`);
  }

  private async getAgentName(agentId: string): Promise<string> {
    const agent = await this.cache.get<CollectionAgent>(`agent:${agentId}`);
    return agent?.name || 'Unknown Agent';
  }

  private async autoAssignCase(caseId: string): Promise<void> {
    // Simplified auto-assignment logic
    logger.debug({ caseId }, 'Auto-assigning case to agent');
  }

  private async initiateCollectionStrategy(caseId: string, strategyId: string): Promise<void> {
    // Implementation for starting collection strategy workflow
    logger.debug({ caseId, strategyId }, 'Initiating collection strategy');
  }

  private async addActionToCase(caseId: string, actionId: string): Promise<void> {
    const actionsKey = `case:${caseId}:actions`;
    await this.cache.listPush(actionsKey, actionId);
  }

  private async processActionOutcome(action: CollectionAction): Promise<void> {
    // Process different outcomes
    switch (action.outcome) {
      case 'payment_received':
        await this.processPaymentReceived(action.caseId);
        break;
      case 'promise_to_pay':
        // Payment promise was already recorded separately
        break;
      case 'no_contact':
        await this.escalateNoContact(action.caseId);
        break;
      default:
        logger.debug({ outcome: action.outcome }, 'Processing action outcome');
    }
  }

  private async processPaymentReceived(caseId: string): Promise<void> {
    const delinquencyCase = await this.getCase(caseId);
    if (delinquencyCase) {
      delinquencyCase.status = 'resolved';
      await this.saveCase(delinquencyCase);
    }
  }

  private async escalateNoContact(caseId: string): Promise<void> {
    const delinquencyCase = await this.getCase(caseId);
    if (delinquencyCase) {
      delinquencyCase.escalationLevel += 1;
      await this.saveCase(delinquencyCase);
    }
  }

  private async addHardshipPlanToCase(caseId: string, planId: string): Promise<void> {
    const plansKey = `case:${caseId}:hardshipplans`;
    await this.cache.listPush(plansKey, planId);
  }

  private async addPromiseToCase(caseId: string, promiseId: string): Promise<void> {
    const promisesKey = `case:${caseId}:promises`;
    await this.cache.listPush(promisesKey, promiseId);
  }

  private async calculatePromiseKeeperScore(userId: string): Promise<number> {
    // Calculate historical promise keeping score (0-100)
    return 75; // Mock score
  }

  private async schedulePromiseFollowUp(promiseId: string, promisedDate: Date): Promise<void> {
    const followUpDate = new Date(promisedDate.getTime() + 24 * 60 * 60 * 1000); // Next day
    logger.debug({ promiseId, followUpDate }, 'Scheduling promise follow-up');
  }

  private getComplianceRequirements(type: HardshipPlan['type']): string[] {
    const requirements = [];
    
    switch (type) {
      case 'temporary_reduction':
        requirements.push('Income verification', 'Hardship documentation');
        break;
      case 'settlement':
        requirements.push('Financial statement', 'Legal review', 'Management approval');
        break;
      default:
        requirements.push('Hardship documentation');
    }
    
    return requirements;
  }

  private async pauseCollectionActivities(caseId: string, reason: string): Promise<void> {
    logger.info({ caseId, reason }, 'Pausing collection activities');
    // Implementation to pause automated collection activities
  }

  private async createEvent(
    type: CollectionEvent['type'],
    caseId: string,
    userId: string,
    data: Record<string, any>
  ): Promise<void> {
    const event: CollectionEvent = {
      id: uuidv4(),
      type,
      caseId,
      userId,
      data,
      timestamp: new Date()
    };

    await this.cache.set(`event:${event.id}`, event, 86400);
    logger.debug({ event }, 'Collection event created');
  }

  private initializeSettings(): void {
    this.settings = {
      defaultStrategy: 'standard_collection',
      autoAssignmentEnabled: true,
      escalationSettings: {
        maxDaysBeforeEscalation: 14,
        maxMissedPromises: 3,
        autoLegalReferralDays: 120,
        writeOffDays: 180
      },
      complianceSettings: {
        maxDailyCallAttempts: 3,
        noCallHours: { start: '21:00', end: '08:00' },
        requiredDocumentationFields: ['contact_attempt', 'outcome', 'next_action'],
        mandatoryCoolingOffHours: 24
      },
      performanceTargets: {
        contactRateTarget: 0.70,
        promiseRateTarget: 0.40,
        recoveryRateTarget: 0.25,
        maxResolutionDays: 60
      },
      notificationSettings: {
        agentAssignmentNotifications: true,
        escalationNotifications: true,
        performanceAlerts: true,
        complianceAlerts: true
      }
    };
  }

  private startScheduledJobs(): void {
    // Daily case review and escalation
    const caseReviewJob = cron.schedule('0 9 * * *', async () => {
      logger.info('Starting daily case review');
      await this.dailyCaseReview();
    }, { scheduled: false });

    // Promise follow-up checks
    const promiseCheckJob = cron.schedule('0 10 * * *', async () => {
      logger.info('Starting promise follow-up checks');
      await this.checkPromiseStatuses();
    }, { scheduled: false });

    // Performance monitoring
    const performanceJob = cron.schedule('0 18 * * *', async () => {
      logger.info('Starting performance monitoring');
      await this.monitorPerformance();
    }, { scheduled: false });

    this.cronJobs.set('case_review', caseReviewJob);
    this.cronJobs.set('promise_check', promiseCheckJob);
    this.cronJobs.set('performance', performanceJob);

    // Start jobs
    caseReviewJob.start();
    promiseCheckJob.start();
    performanceJob.start();

    logger.info('Collections scheduled jobs started');
  }

  private async dailyCaseReview(): Promise<void> {
    logger.info('Daily case review completed');
  }

  private async checkPromiseStatuses(): Promise<void> {
    logger.info('Promise status check completed');
  }

  private async monitorPerformance(): Promise<void> {
    logger.info('Performance monitoring completed');
  }
}