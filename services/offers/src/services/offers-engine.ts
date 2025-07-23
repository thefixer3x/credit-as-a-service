import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { orderBy, groupBy, meanBy } from 'lodash';
import { evaluate } from 'mathjs';

import { SMEAPIClient } from '@caas/sme-integration';
import { validateEnv } from '@caas/config';
import type { CreditAssessmentResult } from '@caas/underwriting';

import type {
  Provider,
  OfferRequest,
  CreditOffer,
  OfferComparison,
  MatchingCriteria,
  PricingModel,
  OfferAnalytics,
  MarketAnalysis,
  OfferInsight,
  AlternativeOffer,
  ProviderPerformance
} from '../types/offers.js';

const logger = pino({ name: 'offers-engine' });
const env = validateEnv();

export class OffersEngine {
  private smeClient: SMEAPIClient;
  private providers: Map<string, Provider> = new Map();
  private pricingModel: PricingModel;
  private matchingCriteria: MatchingCriteria;

  constructor() {
    this.smeClient = new SMEAPIClient();
    this.initializePricingModel();
    this.initializeMatchingCriteria();
    this.loadProviders();
  }

  /**
   * Generate personalized credit offers for a user
   */
  async generateOffers(request: OfferRequest, riskAssessment: CreditAssessmentResult): Promise<OfferComparison> {
    try {
      logger.info({ applicationId: request.applicationId }, 'Generating credit offers');

      // 1. Filter compatible providers
      const compatibleProviders = await this.filterCompatibleProviders(request, riskAssessment);
      
      // 2. Generate offers from each provider
      const offers = await this.generateProviderOffers(request, riskAssessment, compatibleProviders);
      
      // 3. Rank and score offers
      const rankedOffers = this.rankOffers(offers, request, riskAssessment);
      
      // 4. Generate market analysis and insights
      const marketAnalysis = this.generateMarketAnalysis(offers);
      const insights = this.generateInsights(rankedOffers, marketAnalysis);
      const alternatives = this.generateAlternatives(request, rankedOffers);
      
      // 5. Store analytics
      await this.storeOfferAnalytics(request, rankedOffers);

      const comparison: OfferComparison = {
        offers: rankedOffers,
        bestOffer: rankedOffers[0],
        insights,
        alternatives,
        marketAnalysis
      };

      logger.info({
        applicationId: request.applicationId,
        totalOffers: offers.length,
        bestRate: rankedOffers[0]?.interestRate
      }, 'Credit offers generated');

      return comparison;

    } catch (error) {
      logger.error({ error, applicationId: request.applicationId }, 'Failed to generate offers');
      throw new Error('Failed to generate credit offers');
    }
  }

  /**
   * Accept a specific offer
   */
  async acceptOffer(userId: string, offerId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Implementation would update offer status and initiate next steps
      logger.info({ userId, offerId }, 'Credit offer accepted');
      
      return {
        success: true,
        message: 'Offer accepted successfully'
      };
    } catch (error) {
      logger.error({ error, userId, offerId }, 'Failed to accept offer');
      throw new Error('Failed to accept offer');
    }
  }

  /**
   * Filter providers based on compatibility with user and request
   */
  private async filterCompatibleProviders(
    request: OfferRequest,
    riskAssessment: CreditAssessmentResult
  ): Promise<Provider[]> {
    const compatible: Provider[] = [];

    for (const provider of this.providers.values()) {
      // Check if provider is active
      if (!provider.isActive) continue;

      // Check amount range
      if (request.requestedAmount < provider.minAmount || request.requestedAmount > provider.maxAmount) {
        continue;
      }

      // Check term range
      if (request.requestedTermMonths < provider.minTermMonths || request.requestedTermMonths > provider.maxTermMonths) {
        continue;
      }

      // Check risk appetite
      if (!this.isRiskCompatible(provider, riskAssessment)) continue;

      // Check geography
      if (!provider.geographies.includes('NG')) continue; // Default to Nigeria

      // Check currency
      if (!provider.currencies.includes(request.currency)) continue;

      // Check funding availability
      if (provider.funding.availableAmount < request.requestedAmount) continue;

      compatible.push(provider);
    }

    logger.info({ totalProviders: this.providers.size, compatibleProviders: compatible.length }, 'Provider filtering completed');
    return compatible;
  }

  /**
   * Generate offers from compatible providers
   */
  private async generateProviderOffers(
    request: OfferRequest,
    riskAssessment: CreditAssessmentResult,
    providers: Provider[]
  ): Promise<CreditOffer[]> {
    const offers: CreditOffer[] = [];

    for (const provider of providers) {
      try {
        const offer = await this.generateSingleOffer(request, riskAssessment, provider);
        offers.push(offer);
      } catch (error) {
        logger.warn({ providerId: provider.id, error }, 'Failed to generate offer from provider');
      }
    }

    return offers;
  }

  /**
   * Generate a single offer from a provider
   */
  private async generateSingleOffer(
    request: OfferRequest,
    riskAssessment: CreditAssessmentResult,
    provider: Provider
  ): Promise<CreditOffer> {
    // Calculate interest rate using pricing model
    const baseRate = this.pricingModel.baseRate;
    const riskPremium = this.pricingModel.riskPremiums[riskAssessment.riskGrade] || 0.15;
    const competitiveAdjustment = this.calculateCompetitiveAdjustment(provider, request.requestedAmount);
    
    const interestRate = Math.max(
      provider.minInterestRate,
      Math.min(provider.maxInterestRate, baseRate + riskPremium + competitiveAdjustment)
    );

    // Calculate loan amount (may adjust based on risk)
    let offerAmount = request.requestedAmount;
    if (riskAssessment.recommendedAmount && riskAssessment.recommendedAmount < request.requestedAmount) {
      offerAmount = Math.min(request.requestedAmount, riskAssessment.recommendedAmount);
    }

    // Calculate payments
    const monthlyRate = interestRate / 12;
    const monthlyPayment = this.calculateMonthlyPayment(offerAmount, monthlyRate, request.requestedTermMonths);
    const totalPayment = monthlyPayment * request.requestedTermMonths;

    // Calculate fees
    const fees = provider.fees.map(fee => ({
      type: fee.type,
      amount: fee.amount || (fee.percentage! * offerAmount / 100),
      description: fee.description
    }));

    // Calculate matching score
    const score = this.calculateMatchingScore(request, riskAssessment, provider, {
      interestRate,
      amount: offerAmount
    });

    return {
      id: uuidv4(),
      providerId: provider.id,
      providerName: provider.name,
      userId: request.userId,
      applicationId: request.applicationId,
      amount: offerAmount,
      interestRate,
      termMonths: request.requestedTermMonths,
      currency: request.currency,
      monthlyPayment,
      totalPayment,
      fees,
      requirements: provider.requirements.filter(r => r.required).map(r => r.description),
      conditions: riskAssessment.conditions || [],
      score,
      ranking: 0, // Will be set during ranking
      processingTimeHours: provider.processingTimeHours,
      validUntil: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      status: 'pending',
      metadata: {
        riskAssessment: {
          riskScore: riskAssessment.riskScore,
          riskGrade: riskAssessment.riskGrade,
          probabilityOfDefault: riskAssessment.probabilityOfDefault
        },
        matching: this.calculateMatchingComponents(request, riskAssessment, provider),
        pricing: {
          baseRate,
          riskPremium,
          competitiveAdjustment,
          finalRate: interestRate
        }
      },
      createdAt: new Date()
    };
  }

  /**
   * Rank offers by overall score
   */
  private rankOffers(offers: CreditOffer[], request: OfferRequest, riskAssessment: CreditAssessmentResult): CreditOffer[] {
    const rankedOffers = orderBy(offers, ['score'], ['desc']);
    
    // Set ranking
    rankedOffers.forEach((offer, index) => {
      offer.ranking = index + 1;
    });

    return rankedOffers;
  }

  /**
   * Calculate matching score between user request and provider offer
   */
  private calculateMatchingScore(
    request: OfferRequest,
    riskAssessment: CreditAssessmentResult,
    provider: Provider,
    calculatedTerms: { interestRate: number; amount: number }
  ): number {
    const criteria = this.matchingCriteria;
    let totalScore = 0;
    let totalWeight = 0;

    // Risk compatibility
    const riskScore = this.calculateRiskMatchScore(riskAssessment.riskGrade, provider.preferences.preferredRiskGrades);
    totalScore += riskScore * criteria.riskCompatibility;
    totalWeight += criteria.riskCompatibility;

    // Amount match
    const amountScore = calculatedTerms.amount / request.requestedAmount; // Perfect match = 1.0
    totalScore += amountScore * criteria.amountFlexibility;
    totalWeight += criteria.amountFlexibility;

    // Rate competitiveness (lower is better, so invert)
    const rateScore = Math.max(0, 1 - (calculatedTerms.interestRate - provider.minInterestRate) / (provider.maxInterestRate - provider.minInterestRate));
    totalScore += rateScore * criteria.rateCompetitiveness;
    totalWeight += criteria.rateCompetitiveness;

    // Processing speed (faster is better)
    const speedScore = Math.max(0, 1 - (provider.processingTimeHours - 1) / 168); // Normalize to weekly scale
    totalScore += speedScore * criteria.processingSpeed;
    totalWeight += criteria.processingSpeed;

    // Provider reliability (placeholder - would use historical data)
    const reliabilityScore = 0.8; // Would calculate from historical performance
    totalScore += reliabilityScore * criteria.providerReliability;
    totalWeight += criteria.providerReliability;

    return Math.round((totalScore / totalWeight) * 100);
  }

  /**
   * Generate market analysis
   */
  private generateMarketAnalysis(offers: CreditOffer[]): MarketAnalysis {
    if (offers.length === 0) {
      return {
        averageRate: 0,
        rateRange: { min: 0, max: 0 },
        competitivePosition: 'poor',
        marketTrends: [],
        recommendations: ['No offers available - consider improving credit profile']
      };
    }

    const rates = offers.map(o => o.interestRate);
    const averageRate = meanBy(offers, 'interestRate');
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    const bestRate = offers[0]?.interestRate || 0;

    let competitivePosition: MarketAnalysis['competitivePosition'] = 'average';
    if (bestRate <= averageRate * 0.8) competitivePosition = 'excellent';
    else if (bestRate <= averageRate * 0.9) competitivePosition = 'good';
    else if (bestRate >= averageRate * 1.2) competitivePosition = 'poor';

    return {
      averageRate,
      rateRange: { min: minRate, max: maxRate },
      competitivePosition,
      marketTrends: [
        'Credit market showing competitive rates for qualified borrowers',
        'Processing times averaging 24-48 hours',
        'Digital lenders offering faster approvals'
      ],
      recommendations: [
        competitivePosition === 'excellent' ? 'Excellent rate available - consider accepting best offer' :
        competitivePosition === 'good' ? 'Good rates available - compare terms carefully' :
        'Consider improving credit profile for better rates'
      ]
    };
  }

  /**
   * Generate insights about the offers
   */
  private generateInsights(offers: CreditOffer[], marketAnalysis: MarketAnalysis): OfferInsight[] {
    const insights: OfferInsight[] = [];

    if (offers.length === 0) return insights;

    const bestOffer = offers[0];
    const worstOffer = offers[offers.length - 1];

    // Savings insight
    if (offers.length > 1) {
      const savings = (worstOffer.totalPayment - bestOffer.totalPayment);
      insights.push({
        type: 'savings',
        message: `Best offer saves ₦${savings.toLocaleString()} compared to highest rate`,
        impact: 'positive',
        amount: savings
      });
    }

    // Risk insight
    if (bestOffer.metadata.riskAssessment.riskGrade === 'A') {
      insights.push({
        type: 'risk',
        message: 'Excellent credit profile qualifies for premium rates',
        impact: 'positive'
      });
    }

    // Time insight
    const fastestOffer = offers.reduce((prev, curr) => 
      curr.processingTimeHours < prev.processingTimeHours ? curr : prev
    );
    
    if (fastestOffer.processingTimeHours <= 4) {
      insights.push({
        type: 'time',
        message: `Fastest approval available in ${fastestOffer.processingTimeHours} hours`,
        impact: 'positive'
      });
    }

    return insights;
  }

  /**
   * Generate alternative offers
   */
  private generateAlternatives(request: OfferRequest, offers: CreditOffer[]): AlternativeOffer[] {
    const alternatives: AlternativeOffer[] = [];

    // Higher amount alternatives
    const higherAmountOffers = offers.filter(o => o.amount > request.requestedAmount);
    if (higherAmountOffers.length > 0) {
      alternatives.push({
        type: 'higher_amount',
        description: `${higherAmountOffers.length} lenders can offer higher amounts`,
        tradeoff: 'May require longer terms or additional requirements',
        offers: higherAmountOffers.slice(0, 3)
      });
    }

    return alternatives;
  }

  /**
   * Helper methods
   */
  private calculateMonthlyPayment(principal: number, monthlyRate: number, termMonths: number): number {
    if (monthlyRate === 0) return principal / termMonths;
    
    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                   (Math.pow(1 + monthlyRate, termMonths) - 1);
    
    return Math.round(payment * 100) / 100;
  }

  private isRiskCompatible(provider: Provider, assessment: CreditAssessmentResult): boolean {
    return provider.preferences.preferredRiskGrades.includes(assessment.riskGrade);
  }

  private calculateRiskMatchScore(userRiskGrade: string, preferredGrades: string[]): number {
    return preferredGrades.includes(userRiskGrade) ? 1.0 : 0.5;
  }

  private calculateCompetitiveAdjustment(provider: Provider, amount: number): number {
    // Simple competitive adjustment based on market positioning
    const strategy = this.pricingModel.competitiveFactors.positioningStrategy;
    
    switch (strategy) {
      case 'aggressive': return -0.01; // 1% below market
      case 'premium': return 0.01; // 1% above market
      default: return 0; // Market rate
    }
  }

  private calculateMatchingComponents(request: OfferRequest, assessment: CreditAssessmentResult, provider: Provider) {
    return {
      riskMatch: this.calculateRiskMatchScore(assessment.riskGrade, provider.preferences.preferredRiskGrades) * 100,
      amountMatch: 100, // Simplified for now
      termMatch: 100,
      geographyMatch: 100,
      requirementsMatch: 100
    };
  }

  private async storeOfferAnalytics(request: OfferRequest, offers: CreditOffer[]): Promise<void> {
    // Implementation would store analytics in database
    logger.info({ applicationId: request.applicationId, offerCount: offers.length }, 'Offer analytics stored');
  }

  private initializePricingModel(): void {
    this.pricingModel = {
      baseRate: 0.12, // 12% base rate
      riskPremiums: {
        'A': 0.02, // 2% premium for grade A
        'B': 0.05, // 5% premium for grade B
        'C': 0.08, // 8% premium for grade C
        'D': 0.12, // 12% premium for grade D
        'E': 0.18  // 18% premium for grade E
      },
      competitiveFactors: {
        marketRate: 0.15,
        positioningStrategy: 'market',
        volumeDiscounts: [
          { minAmount: 1000000, maxAmount: 5000000, discountBps: 50 },
          { minAmount: 5000000, maxAmount: 10000000, discountBps: 100 }
        ]
      },
      seasonalAdjustments: []
    };

    logger.info('Pricing model initialized');
  }

  private initializeMatchingCriteria(): void {
    this.matchingCriteria = {
      riskCompatibility: 0.25,
      amountFlexibility: 0.15,
      termFlexibility: 0.10,
      rateCompetitiveness: 0.25,
      processingSpeed: 0.10,
      providerReliability: 0.10,
      feeStructure: 0.05,
      requirementsMatch: 0.10
    };

    logger.info('Matching criteria initialized');
  }

  private async loadProviders(): Promise<void> {
    // In production, this would load from database
    const mockProviders: Provider[] = [
      {
        id: 'provider-001',
        name: 'First Bank Credit',
        type: 'bank',
        minAmount: 100000,
        maxAmount: 10000000,
        minTermMonths: 6,
        maxTermMonths: 36,
        minInterestRate: 0.08,
        maxInterestRate: 0.25,
        riskAppetite: 'conservative',
        geographies: ['NG'],
        currencies: ['NGN'],
        processingTimeHours: 48,
        requirements: [
          { type: 'kyc', required: true, description: 'Valid government ID and address verification' },
          { type: 'income_verification', required: true, description: '3 months bank statements' }
        ],
        fees: [
          { type: 'origination', percentage: 1.5, description: 'Loan origination fee' }
        ],
        isActive: true,
        funding: {
          availableAmount: 100000000,
          reservedAmount: 20000000,
          totalCapacity: 120000000,
          lastUpdated: new Date()
        },
        preferences: {
          preferredRiskGrades: ['A', 'B', 'C'],
          excludedIndustries: ['gambling'],
          minCreditHistory: 6,
          maxDebtToIncome: 0.4,
          requiresGuarantor: false,
          allowsRefinancing: true
        }
      },
      {
        id: 'provider-002',
        name: 'Fintech Quick Credit',
        type: 'fintech',
        minAmount: 50000,
        maxAmount: 5000000,
        minTermMonths: 3,
        maxTermMonths: 24,
        minInterestRate: 0.12,
        maxInterestRate: 0.35,
        riskAppetite: 'aggressive',
        geographies: ['NG'],
        currencies: ['NGN'],
        processingTimeHours: 4,
        requirements: [
          { type: 'kyc', required: true, description: 'Digital KYC verification' }
        ],
        fees: [
          { type: 'processing', amount: 5000, description: 'Processing fee' }
        ],
        isActive: true,
        funding: {
          availableAmount: 50000000,
          reservedAmount: 10000000,
          totalCapacity: 60000000,
          lastUpdated: new Date()
        },
        preferences: {
          preferredRiskGrades: ['B', 'C', 'D', 'E'],
          excludedIndustries: [],
          minCreditHistory: 0,
          maxDebtToIncome: 0.6,
          requiresGuarantor: false,
          allowsRefinancing: false
        }
      }
    ];

    for (const provider of mockProviders) {
      this.providers.set(provider.id, provider);
    }

    logger.info({ providerCount: this.providers.size }, 'Providers loaded');
  }
}