import { Logger } from '@caas/common';
import { v4 as uuidv4 } from 'uuid';
import { 
  LeadData, 
  ProviderLoanDecision, 
  LeadStatusUpdate,
  CreditProvider 
} from '../types/credit-provider';
import { CreditProviderRepository } from '../repositories/credit-provider-repository';
import { LeadRepository } from '../repositories/lead-repository';
import { WebhookService } from './webhook-service';
import { NotificationService } from './notification-service';
import { EventPublisher } from '@caas/common';

export interface LeadDistributionResult {
  distributionId: string;
  providersNotified: number;
  estimatedResponseTime: number;
  distribution: Array<{
    providerId: string;
    providerName: string;
    score: number;
    expectedResponseTime: number;
  }>;
}

export interface ProviderLead {
  id: string;
  leadId: string;
  providerId: string;
  leadData: LeadData;
  status: 'sent' | 'received' | 'reviewing' | 'responded' | 'expired';
  distributedAt: Date;
  respondedAt?: Date;
  decision?: ProviderLoanDecision;
  matchingScore: number;
  priority: 'high' | 'medium' | 'low';
  expiresAt: Date;
}

export class LeadDistributionService {
  private logger: Logger;
  private providerRepository: CreditProviderRepository;
  private leadRepository: LeadRepository;
  private webhookService: WebhookService;
  private notificationService: NotificationService;
  private eventPublisher: EventPublisher;

  constructor(
    logger: Logger,
    providerRepository: CreditProviderRepository,
    leadRepository: LeadRepository,
    webhookService: WebhookService,
    notificationService: NotificationService,
    eventPublisher: EventPublisher
  ) {
    this.logger = logger;
    this.providerRepository = providerRepository;
    this.leadRepository = leadRepository;
    this.webhookService = webhookService;
    this.notificationService = notificationService;
    this.eventPublisher = eventPublisher;
  }

  async distributeLead(leadData: LeadData): Promise<LeadDistributionResult> {
    try {
      const distributionId = `dist_${uuidv4()}`;
      
      // Find eligible providers
      const eligibleProviders = await this.findEligibleProviders(leadData);
      
      if (eligibleProviders.length === 0) {
        throw new Error('No eligible providers found for this lead');
      }

      // Score and rank providers
      const rankedProviders = await this.scoreAndRankProviders(eligibleProviders, leadData);
      
      // Distribute to top providers (limit to top 5 for better conversion)
      const selectedProviders = rankedProviders.slice(0, 5);
      
      // Create distribution record
      const distribution = await this.createDistributionRecord(distributionId, leadData, selectedProviders);
      
      // Send leads to providers
      const notificationResults = await this.sendLeadToProviders(leadData, selectedProviders, distributionId);
      
      // Calculate estimated response time
      const estimatedResponseTime = this.calculateEstimatedResponseTime(selectedProviders);
      
      // Publish distribution event
      await this.eventPublisher.publishEvent({
        type: 'lead.distributed',
        data: {
          distributionId,
          leadId: leadData.leadId,
          providersCount: selectedProviders.length,
          estimatedResponseTime,
        },
      });
      
      this.logger.info('Lead distributed successfully', {
        distributionId,
        leadId: leadData.leadId,
        providersNotified: selectedProviders.length,
        requestedAmount: leadData.loanApplication.requestedAmount,
      });

      return {
        distributionId,
        providersNotified: selectedProviders.length,
        estimatedResponseTime,
        distribution: selectedProviders.map(p => ({
          providerId: p.id,
          providerName: p.registrationData.companyName,
          score: p.matchingScore || 0,
          expectedResponseTime: p.averageResponseTime || 24,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to distribute lead', { error, leadId: leadData.leadId });
      throw error;
    }
  }

  async getProviderLeads(
    providerId: string,
    filters: {
      status?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    leads: ProviderLead[];
    total: number;
    summary: {
      pending: number;
      responded: number;
      expired: number;
    };
  }> {
    try {
      const result = await this.leadRepository.getProviderLeads(providerId, filters);
      
      // Calculate summary statistics
      const summary = {
        pending: result.leads.filter(l => ['sent', 'received', 'reviewing'].includes(l.status)).length,
        responded: result.leads.filter(l => l.status === 'responded').length,
        expired: result.leads.filter(l => l.status === 'expired').length,
      };

      return {
        leads: result.leads,
        total: result.total,
        summary,
      };
    } catch (error) {
      this.logger.error('Failed to get provider leads', { error, providerId });
      throw error;
    }
  }

  async processProviderDecision(
    providerId: string,
    leadId: string,
    decision: ProviderLoanDecision
  ): Promise<{
    accepted: boolean;
    reason?: string;
    nextSteps?: string[];
  }> {
    try {
      // Validate provider and lead
      const providerLead = await this.leadRepository.getProviderLead(providerId, leadId);
      if (!providerLead) {
        throw new Error('Lead not found or not assigned to this provider');
      }

      if (providerLead.status === 'expired') {
        throw new Error('Lead has already expired');
      }

      if (providerLead.status === 'responded') {
        throw new Error('Decision already submitted for this lead');
      }

      // Validate decision data
      await this.validateProviderDecision(decision, providerLead);

      // Update lead status
      await this.leadRepository.updateProviderLead(providerId, leadId, {
        status: 'responded',
        respondedAt: new Date(),
        decision,
      });

      // Update provider performance metrics
      await this.updateProviderMetrics(providerId, decision);

      // Process the decision
      const result = await this.processDecision(providerLead, decision);

      // Notify relevant parties
      await this.notifyDecisionReceived(providerLead, decision);

      // Publish decision event
      await this.eventPublisher.publishEvent({
        type: 'provider.decision.received',
        data: {
          providerId,
          leadId,
          decision: decision.decision,
          approvedAmount: decision.approvedAmount,
          interestRate: decision.interestRate,
        },
      });

      this.logger.info('Provider decision processed', {
        providerId,
        leadId,
        decision: decision.decision,
        approvedAmount: decision.approvedAmount,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to process provider decision', { error, providerId, leadId });
      throw error;
    }
  }

  async updateLeadStatus(
    providerId: string,
    leadId: string,
    statusUpdate: {
      status: string;
      statusMessage: string;
      metadata?: any;
    }
  ): Promise<void> {
    try {
      const providerLead = await this.leadRepository.getProviderLead(providerId, leadId);
      if (!providerLead) {
        throw new Error('Lead not found');
      }

      // Create status update record
      const update: LeadStatusUpdate = {
        leadId,
        providerId,
        status: statusUpdate.status as any,
        statusMessage: statusUpdate.statusMessage,
        updatedAt: new Date(),
        metadata: statusUpdate.metadata,
      };

      await this.leadRepository.createStatusUpdate(update);

      // Update lead status if it's a significant change
      if (this.isSignificantStatusChange(providerLead.status, statusUpdate.status)) {
        await this.leadRepository.updateProviderLead(providerId, leadId, {
          status: statusUpdate.status as any,
        });
      }

      // Notify platform of status change
      await this.notificationService.notifyLeadStatusChange(providerLead, update);

      this.logger.info('Lead status updated', {
        providerId,
        leadId,
        status: statusUpdate.status,
        message: statusUpdate.statusMessage,
      });
    } catch (error) {
      this.logger.error('Failed to update lead status', { error, providerId, leadId });
      throw error;
    }
  }

  async getLeadDistributionAnalytics(leadId: string): Promise<{
    distributionId: string;
    totalProviders: number;
    responseRate: number;
    averageResponseTime: number;
    bestOffer?: {
      providerId: string;
      providerName: string;
      approvedAmount: number;
      interestRate: number;
    };
    providerResponses: Array<{
      providerId: string;
      providerName: string;
      status: string;
      responseTime?: number;
      decision?: string;
      approvedAmount?: number;
      interestRate?: number;
    }>;
  }> {
    try {
      const distribution = await this.leadRepository.getLeadDistribution(leadId);
      if (!distribution) {
        throw new Error('Distribution not found for this lead');
      }

      const providerLeads = await this.leadRepository.getDistributionProviderLeads(distribution.id);
      
      const responseRate = (providerLeads.filter(pl => pl.status === 'responded').length / providerLeads.length) * 100;
      
      const responseTimes = providerLeads
        .filter(pl => pl.respondedAt)
        .map(pl => (pl.respondedAt!.getTime() - pl.distributedAt.getTime()) / (1000 * 60 * 60)); // hours
      
      const averageResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
        : 0;

      // Find best offer (lowest interest rate for approved applications)
      const approvedOffers = providerLeads
        .filter(pl => pl.decision?.decision === 'approved')
        .sort((a, b) => (a.decision?.interestRate || Infinity) - (b.decision?.interestRate || Infinity));
      
      const bestOffer = approvedOffers.length > 0 ? {
        providerId: approvedOffers[0].providerId,
        providerName: 'Provider Name', // This would come from provider data
        approvedAmount: approvedOffers[0].decision?.approvedAmount || 0,
        interestRate: approvedOffers[0].decision?.interestRate || 0,
      } : undefined;

      const providerResponses = providerLeads.map(pl => ({
        providerId: pl.providerId,
        providerName: 'Provider Name', // This would come from provider data
        status: pl.status,
        responseTime: pl.respondedAt 
          ? (pl.respondedAt.getTime() - pl.distributedAt.getTime()) / (1000 * 60 * 60)
          : undefined,
        decision: pl.decision?.decision,
        approvedAmount: pl.decision?.approvedAmount,
        interestRate: pl.decision?.interestRate,
      }));

      return {
        distributionId: distribution.id,
        totalProviders: providerLeads.length,
        responseRate,
        averageResponseTime,
        bestOffer,
        providerResponses,
      };
    } catch (error) {
      this.logger.error('Failed to get lead distribution analytics', { error, leadId });
      throw error;
    }
  }

  // Private helper methods

  private async findEligibleProviders(leadData: LeadData): Promise<CreditProvider[]> {
    const criteria = {
      status: 'active',
      minimumAmount: leadData.loanApplication.requestedAmount,
      maximumAmount: leadData.loanApplication.requestedAmount,
      geographicCoverage: leadData.applicant.personalInfo.address.country,
      supportedCurrencies: ['USD'], // This would be dynamic based on lead
    };

    return await this.providerRepository.findEligibleProviders(criteria);
  }

  private async scoreAndRankProviders(
    providers: CreditProvider[],
    leadData: LeadData
  ): Promise<(CreditProvider & { matchingScore: number; averageResponseTime: number })[]> {
    const scoredProviders = providers.map(provider => {
      const score = this.calculateProviderScore(provider, leadData);
      return {
        ...provider,
        matchingScore: score,
        averageResponseTime: provider.performance.averageResponseTime || 24,
      };
    });

    // Sort by score (highest first) and then by response time (fastest first)
    return scoredProviders.sort((a, b) => {
      if (b.matchingScore === a.matchingScore) {
        return a.averageResponseTime - b.averageResponseTime;
      }
      return b.matchingScore - a.matchingScore;
    });
  }

  private calculateProviderScore(provider: CreditProvider, leadData: LeadData): number {
    let score = 0;

    // Base score for active status
    if (provider.status === 'active') score += 20;

    // Credit amount compatibility (30 points max)
    const requestedAmount = leadData.loanApplication.requestedAmount;
    const minAmount = provider.registrationData.creditCapacity.minimumLoanAmount;
    const maxAmount = provider.registrationData.creditCapacity.maximumLoanAmount;
    
    if (requestedAmount >= minAmount && requestedAmount <= maxAmount) {
      score += 30;
      // Bonus if it's in their sweet spot (middle 50% of their range)
      const range = maxAmount - minAmount;
      const sweetSpotMin = minAmount + range * 0.25;
      const sweetSpotMax = maxAmount - range * 0.25;
      if (requestedAmount >= sweetSpotMin && requestedAmount <= sweetSpotMax) {
        score += 10;
      }
    }

    // Performance metrics (25 points max)
    score += Math.min(provider.performance.approvalRate / 4, 15); // Max 15 points for approval rate
    score += Math.min((100 - provider.performance.averageResponseTime) / 10, 10); // Max 10 points for response time

    // Geographic compatibility (10 points)
    const applicantCountry = leadData.applicant.personalInfo.address.country;
    if (provider.registrationData.creditCapacity.geographicCoverage.includes(applicantCountry)) {
      score += 10;
    }

    // Credit score compatibility (15 points)
    const applicantCreditScore = leadData.creditAssessment.creditScore;
    const riskRating = leadData.creditAssessment.riskRating;
    
    // Providers typically prefer higher credit scores
    if (applicantCreditScore >= 750) score += 15;
    else if (applicantCreditScore >= 650) score += 10;
    else if (applicantCreditScore >= 550) score += 5;

    // Risk rating consideration
    if (riskRating === 'low') score += 5;
    else if (riskRating === 'high') score -= 5;

    return Math.max(0, Math.min(100, score)); // Ensure score is between 0-100
  }

  private async createDistributionRecord(
    distributionId: string,
    leadData: LeadData,
    providers: CreditProvider[]
  ): Promise<any> {
    const distribution = {
      id: distributionId,
      leadId: leadData.leadId,
      providersCount: providers.length,
      distributedAt: new Date(),
      status: 'active',
      criteria: {
        requestedAmount: leadData.loanApplication.requestedAmount,
        creditScore: leadData.creditAssessment.creditScore,
        riskRating: leadData.creditAssessment.riskRating,
        country: leadData.applicant.personalInfo.address.country,
      },
    };

    return await this.leadRepository.createDistribution(distribution);
  }

  private async sendLeadToProviders(
    leadData: LeadData,
    providers: CreditProvider[],
    distributionId: string
  ): Promise<Array<{ providerId: string; success: boolean; error?: string }>> {
    const results = [];

    for (const provider of providers) {
      try {
        // Create provider lead record
        const providerLead: ProviderLead = {
          id: `pl_${uuidv4()}`,
          leadId: leadData.leadId,
          providerId: provider.id,
          leadData,
          status: 'sent',
          distributedAt: new Date(),
          matchingScore: provider.matchingScore || 0,
          priority: this.determinePriority(provider.matchingScore || 0),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
        };

        await this.leadRepository.createProviderLead(providerLead);

        // Send webhook to provider
        const webhookData = {
          eventType: 'lead_received',
          providerId: provider.id,
          timestamp: new Date(),
          data: leadData,
          distributionId,
          expiresAt: providerLead.expiresAt,
        };

        const webhookResult = await this.webhookService.sendWebhook(
          provider.id,
          provider.registrationData.technicalRequirements.webhookUrl,
          webhookData,
          provider.apiCredentials.webhookSecret
        );

        if (webhookResult.success) {
          // Update lead status to received
          await this.leadRepository.updateProviderLead(provider.id, leadData.leadId, {
            status: 'received',
          });
        }

        results.push({
          providerId: provider.id,
          success: webhookResult.success,
          error: webhookResult.success ? undefined : webhookResult.error,
        });

        // Update provider metrics
        await this.updateProviderLeadMetrics(provider.id);

      } catch (error) {
        this.logger.error('Failed to send lead to provider', {
          error,
          providerId: provider.id,
          leadId: leadData.leadId,
        });
        
        results.push({
          providerId: provider.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  private calculateEstimatedResponseTime(providers: CreditProvider[]): number {
    if (providers.length === 0) return 24;
    
    const avgResponseTime = providers.reduce(
      (sum, provider) => sum + (provider.performance.averageResponseTime || 24),
      0
    ) / providers.length;

    return Math.round(avgResponseTime);
  }

  private determinePriority(matchingScore: number): 'high' | 'medium' | 'low' {
    if (matchingScore >= 80) return 'high';
    if (matchingScore >= 60) return 'medium';
    return 'low';
  }

  private async validateProviderDecision(
    decision: ProviderLoanDecision,
    providerLead: ProviderLead
  ): Promise<void> {
    if (decision.leadId !== providerLead.leadId) {
      throw new Error('Lead ID mismatch');
    }

    if (decision.providerId !== providerLead.providerId) {
      throw new Error('Provider ID mismatch');
    }

    if (decision.decision === 'approved') {
      if (!decision.approvedAmount || decision.approvedAmount <= 0) {
        throw new Error('Approved amount is required for approved decisions');
      }
      
      if (!decision.interestRate || decision.interestRate <= 0) {
        throw new Error('Interest rate is required for approved decisions');
      }
      
      if (!decision.tenure || decision.tenure <= 0) {
        throw new Error('Tenure is required for approved decisions');
      }
    }

    if (decision.decision === 'rejected' && !decision.rejectionReason) {
      throw new Error('Rejection reason is required for rejected decisions');
    }
  }

  private async processDecision(
    providerLead: ProviderLead,
    decision: ProviderLoanDecision
  ): Promise<{ accepted: boolean; reason?: string; nextSteps?: string[] }> {
    // This would contain business logic for processing the decision
    // For now, we'll accept all valid decisions
    
    const nextSteps = [];
    
    if (decision.decision === 'approved') {
      nextSteps.push('Customer will be notified of approval');
      nextSteps.push('Customer can accept or decline the offer');
      nextSteps.push('Upon acceptance, loan agreement will be generated');
    } else if (decision.decision === 'rejected') {
      nextSteps.push('Customer will be notified of rejection');
      nextSteps.push('Feedback will be provided if available');
    } else if (decision.decision === 'needs_more_info') {
      nextSteps.push('Customer will be asked to provide additional information');
      nextSteps.push('Application will be re-evaluated upon submission');
    }

    return {
      accepted: true,
      nextSteps,
    };
  }

  private async updateProviderMetrics(providerId: string, decision: ProviderLoanDecision): Promise<void> {
    try {
      // Calculate response time
      const now = new Date();
      const providerLead = await this.leadRepository.getProviderLead(providerId, decision.leadId);
      
      if (providerLead) {
        const responseTime = (now.getTime() - providerLead.distributedAt.getTime()) / (1000 * 60 * 60); // hours
        
        // Update provider performance through provider service
        await this.providerRepository.updateProviderPerformance(providerId, {
          responseTime,
          decision: decision.decision as 'approved' | 'rejected',
        });
      }
    } catch (error) {
      this.logger.error('Failed to update provider metrics', { error, providerId });
    }
  }

  private async updateProviderLeadMetrics(providerId: string): Promise<void> {
    try {
      await this.providerRepository.incrementLeadCount(providerId);
    } catch (error) {
      this.logger.error('Failed to update provider lead metrics', { error, providerId });
    }
  }

  private async notifyDecisionReceived(
    providerLead: ProviderLead,
    decision: ProviderLoanDecision
  ): Promise<void> {
    try {
      // Notify the customer about the decision
      await this.notificationService.notifyCustomerOfProviderDecision(providerLead, decision);
      
      // Notify internal team if it's a high-value loan
      if (decision.approvedAmount && decision.approvedAmount > 100000) {
        await this.notificationService.notifyHighValueLoanDecision(providerLead, decision);
      }
    } catch (error) {
      this.logger.error('Failed to send decision notifications', { error });
    }
  }

  private isSignificantStatusChange(currentStatus: string, newStatus: string): boolean {
    const significantChanges = [
      'reviewing',
      'disbursed',
      'completed',
      'defaulted',
    ];
    
    return significantChanges.includes(newStatus) && currentStatus !== newStatus;
  }
}