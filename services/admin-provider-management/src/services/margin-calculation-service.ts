import { Logger } from '@caas/common';
import { MarginConfiguration, ProviderPerformance, MarginConfigurationError } from '../types/admin-provider-management';
import { AdminProviderRepository } from '../repositories/admin-provider-repository';
import { v4 as uuidv4 } from 'uuid';

export class MarginCalculationService {
  private logger: Logger;
  private adminProviderRepository: AdminProviderRepository;

  constructor(
    logger: Logger,
    adminProviderRepository: AdminProviderRepository
  ) {
    this.logger = logger;
    this.adminProviderRepository = adminProviderRepository;
  }

  async calculateMargin(
    providerId: string,
    leadAmount: number,
    providerPerformance?: ProviderPerformance
  ): Promise<{
    marginAmount: number;
    marginPercentage: number;
    calculationDetails: any;
  }> {
    try {
      const marginConfig = await this.adminProviderRepository.findMarginConfig(providerId);
      
      if (!marginConfig) {
        throw new MarginConfigurationError(
          'Margin configuration not found for provider',
          'MARGIN_CONFIG_NOT_FOUND',
          404
        );
      }

      let marginPercentage = 0;
      let calculationDetails: any = {
        configType: marginConfig.marginStructure.type,
        basePercentage: marginConfig.marginStructure.basePercentage,
        leadAmount
      };

      switch (marginConfig.marginStructure.type) {
        case 'fixed_percentage':
          marginPercentage = marginConfig.marginStructure.basePercentage;
          calculationDetails.calculation = 'Fixed percentage applied';
          break;

        case 'tiered':
          marginPercentage = this.calculateTieredMargin(
            leadAmount,
            marginConfig.marginStructure.tierStructure || [],
            marginConfig.marginStructure.basePercentage
          );
          calculationDetails.tierApplied = this.findApplicableTier(
            leadAmount,
            marginConfig.marginStructure.tierStructure || []
          );
          break;

        case 'performance_based':
          marginPercentage = this.calculatePerformanceBasedMargin(
            marginConfig.marginStructure.basePercentage,
            marginConfig.marginStructure.performanceMultipliers,
            providerPerformance
          );
          calculationDetails.performanceMultiplier = this.getPerformanceMultiplier(
            marginConfig.marginStructure.performanceMultipliers,
            providerPerformance
          );
          break;

        case 'custom':
          marginPercentage = await this.calculateCustomMargin(
            providerId,
            leadAmount,
            marginConfig,
            providerPerformance
          );
          calculationDetails.calculation = 'Custom calculation applied';
          break;

        default:
          marginPercentage = marginConfig.marginStructure.basePercentage;
      }

      // Apply adjustment rules
      marginPercentage = this.applyAdjustmentRules(
        marginPercentage,
        leadAmount,
        marginConfig.adjustmentRules,
        providerPerformance
      );

      // Ensure margin is within bounds
      marginPercentage = Math.max(
        marginConfig.minimumMargin,
        Math.min(marginConfig.maximumMargin, marginPercentage)
      );

      const marginAmount = (leadAmount * marginPercentage) / 100;

      calculationDetails.finalPercentage = marginPercentage;
      calculationDetails.adjustmentRulesApplied = marginConfig.adjustmentRules.length > 0;
      calculationDetails.boundsEnforced = {
        minimum: marginConfig.minimumMargin,
        maximum: marginConfig.maximumMargin
      };

      this.logger.info('Margin calculated successfully', {
        providerId,
        leadAmount,
        marginAmount,
        marginPercentage
      });

      return {
        marginAmount,
        marginPercentage,
        calculationDetails
      };
    } catch (error) {
      this.logger.error('Failed to calculate margin', { error, providerId, leadAmount });
      throw error;
    }
  }

  async activateMarginConfiguration(providerId: string): Promise<void> {
    try {
      await this.adminProviderRepository.activateMarginConfiguration(providerId);
      
      this.logger.info('Margin configuration activated', { providerId });
    } catch (error) {
      this.logger.error('Failed to activate margin configuration', { error, providerId });
      throw error;
    }
  }

  async updateMarginConfiguration(
    providerId: string,
    marginConfig: MarginConfiguration,
    adminId: string
  ): Promise<void> {
    try {
      // Validate margin configuration
      this.validateMarginConfiguration(marginConfig);

      // Update configuration
      await this.adminProviderRepository.updateMarginConfiguration(providerId, marginConfig);

      // Log the update
      await this.adminProviderRepository.logAdminAction({
        id: uuidv4(),
        adminId,
        providerId,
        action: 'margin_updated',
        details: {
          description: 'Updated margin configuration',
          newValue: marginConfig
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Margin configuration updated', { providerId, updatedBy: adminId });
    } catch (error) {
      this.logger.error('Failed to update margin configuration', { error, providerId, adminId });
      throw error;
    }
  }

  async getMarginProjections(
    providerId: string,
    projectionData: {
      expectedMonthlyLeads: number;
      averageLeadAmount: number;
      projectionMonths: number;
    }
  ): Promise<{
    monthlyProjections: Array<{
      month: number;
      expectedLeads: number;
      expectedRevenue: number;
      expectedMargin: number;
    }>;
    totalProjection: {
      totalLeads: number;
      totalRevenue: number;
      totalMargin: number;
    };
  }> {
    try {
      const marginConfig = await this.adminProviderRepository.findMarginConfig(providerId);
      const performanceResult = await this.adminProviderRepository.getProviderPerformance(providerId);
      // Convert null to undefined for optional parameter compatibility
      const performance = performanceResult ?? undefined;

      if (!marginConfig) {
        throw new MarginConfigurationError(
          'Margin configuration not found',
          'MARGIN_CONFIG_NOT_FOUND',
          404
        );
      }

      const monthlyProjections = [];
      let totalLeads = 0;
      let totalRevenue = 0;
      let totalMargin = 0;

      for (let month = 1; month <= projectionData.projectionMonths; month++) {
        // Apply growth/decay factors based on performance trends
        const adjustedLeads = this.applyGrowthFactor(
          projectionData.expectedMonthlyLeads,
          month,
          performance
        );

        const expectedRevenue = adjustedLeads * projectionData.averageLeadAmount;

        const marginCalculation = await this.calculateMargin(
          providerId,
          projectionData.averageLeadAmount,
          performance
        );

        const expectedMargin = adjustedLeads * marginCalculation.marginAmount;

        monthlyProjections.push({
          month,
          expectedLeads: adjustedLeads,
          expectedRevenue,
          expectedMargin
        });

        totalLeads += adjustedLeads;
        totalRevenue += expectedRevenue;
        totalMargin += expectedMargin;
      }

      return {
        monthlyProjections,
        totalProjection: {
          totalLeads,
          totalRevenue,
          totalMargin
        }
      };
    } catch (error) {
      this.logger.error('Failed to get margin projections', { error, providerId });
      throw error;
    }
  }

  async optimizeMarginConfiguration(
    providerId: string,
    optimizationGoals: {
      targetRevenue?: number;
      maxMarginPercentage?: number;
      competitiveFactors?: any;
    }
  ): Promise<{
    recommendedConfiguration: MarginConfiguration;
    projectedImpact: {
      revenueIncrease: number;
      competitivenessScore: number;
      providerSatisfactionImpact: number;
    };
  }> {
    try {
      const currentConfig = await this.adminProviderRepository.findMarginConfig(providerId);
      const performanceResult = await this.adminProviderRepository.getProviderPerformance(providerId);
      // Convert null to undefined for optional parameter compatibility
      const performance = performanceResult ?? undefined;
      const marketData = await this.getMarketComparisonData(providerId);

      if (!currentConfig) {
        throw new MarginConfigurationError(
          'Current margin configuration not found',
          'MARGIN_CONFIG_NOT_FOUND',
          404
        );
      }

      // Analyze current performance and market position
      const analysis = this.analyzeMarginPerformance(currentConfig, performance, marketData);

      // Generate optimized configuration
      const recommendedConfiguration = this.generateOptimizedConfiguration(
        currentConfig,
        analysis,
        optimizationGoals
      );

      // Calculate projected impact
      const projectedImpact = await this.calculateOptimizationImpact(
        currentConfig,
        recommendedConfiguration,
        performance
      );

      this.logger.info('Margin configuration optimized', {
        providerId,
        currentMargin: currentConfig.marginStructure.basePercentage,
        recommendedMargin: recommendedConfiguration.marginStructure.basePercentage
      });

      return {
        recommendedConfiguration,
        projectedImpact
      };
    } catch (error) {
      this.logger.error('Failed to optimize margin configuration', { error, providerId });
      throw error;
    }
  }

  private calculateTieredMargin(
    leadAmount: number,
    tierStructure: Array<{ minVolume: number; maxVolume: number; percentage: number }>,
    basePercentage: number
  ): number {
    const applicableTier = this.findApplicableTier(leadAmount, tierStructure);
    return applicableTier ? applicableTier.percentage : basePercentage;
  }

  private findApplicableTier(
    leadAmount: number,
    tierStructure: Array<{ minVolume: number; maxVolume: number; percentage: number }>
  ): { minVolume: number; maxVolume: number; percentage: number } | null {
    return tierStructure.find(tier => 
      leadAmount >= tier.minVolume && leadAmount <= tier.maxVolume
    ) || null;
  }

  private calculatePerformanceBasedMargin(
    basePercentage: number,
    performanceMultipliers: any,
    providerPerformance?: ProviderPerformance
  ): number {
    if (!providerPerformance || !performanceMultipliers) {
      return basePercentage;
    }

    const multiplier = this.getPerformanceMultiplier(performanceMultipliers, providerPerformance);
    return basePercentage * multiplier;
  }

  private getPerformanceMultiplier(
    performanceMultipliers: any,
    providerPerformance?: ProviderPerformance
  ): number {
    if (!providerPerformance) {
      return 1.0;
    }

    const performanceScore = providerPerformance.ranking.performanceScore;

    if (performanceScore >= 80) {
      return performanceMultipliers.highPerformance || 1.2;
    } else if (performanceScore >= 60) {
      return performanceMultipliers.standardPerformance || 1.0;
    } else {
      return performanceMultipliers.lowPerformance || 0.8;
    }
  }

  private async calculateCustomMargin(
    providerId: string,
    leadAmount: number,
    marginConfig: MarginConfiguration,
    providerPerformance?: ProviderPerformance
  ): Promise<number> {
    // Custom margin calculation logic would be implemented here
    // This could include complex algorithms, ML models, etc.
    
    // For now, return base percentage with some adjustments
    let customPercentage = marginConfig.marginStructure.basePercentage;

    // Example custom logic: adjust based on provider tier
    const providerTier = await this.getProviderTier(providerId);
    switch (providerTier) {
      case 'platinum':
        customPercentage *= 0.9; // 10% discount for platinum providers
        break;
      case 'gold':
        customPercentage *= 0.95; // 5% discount for gold providers
        break;
      case 'silver':
        customPercentage *= 1.0; // No adjustment
        break;
      default:
        customPercentage *= 1.05; // 5% premium for new providers
    }

    return customPercentage;
  }

  private applyAdjustmentRules(
    baseMarginPercentage: number,
    leadAmount: number,
    adjustmentRules: Array<{ condition: string; adjustment: number; type: 'add' | 'multiply' | 'set' }>,
    providerPerformance?: ProviderPerformance
  ): number {
    let adjustedMargin = baseMarginPercentage;

    for (const rule of adjustmentRules) {
      if (this.evaluateCondition(rule.condition, leadAmount, providerPerformance)) {
        switch (rule.type) {
          case 'add':
            adjustedMargin += rule.adjustment;
            break;
          case 'multiply':
            adjustedMargin *= rule.adjustment;
            break;
          case 'set':
            adjustedMargin = rule.adjustment;
            break;
        }
      }
    }

    return adjustedMargin;
  }

  private evaluateCondition(
    condition: string,
    leadAmount: number,
    providerPerformance?: ProviderPerformance
  ): boolean {
    // Simple condition evaluation - in production, this would be more sophisticated
    if (condition.includes('amount > ')) {
      const threshold = parseFloat(condition.split('amount > ')[1]);
      return leadAmount > threshold;
    }

    if (condition.includes('performance < ') && providerPerformance) {
      const threshold = parseFloat(condition.split('performance < ')[1]);
      return providerPerformance.ranking.performanceScore < threshold;
    }

    return false;
  }

  private validateMarginConfiguration(marginConfig: MarginConfiguration): void {
    if (marginConfig.minimumMargin >= marginConfig.maximumMargin) {
      throw new MarginConfigurationError(
        'Minimum margin must be less than maximum margin',
        'INVALID_MARGIN_BOUNDS',
        400
      );
    }

    if (marginConfig.marginStructure.basePercentage < 0 || marginConfig.marginStructure.basePercentage > 100) {
      throw new MarginConfigurationError(
        'Base margin percentage must be between 0 and 100',
        'INVALID_BASE_PERCENTAGE',
        400
      );
    }
  }

  private applyGrowthFactor(
    baseLeads: number,
    month: number,
    performance?: ProviderPerformance
  ): number {
    if (!performance) {
      return baseLeads;
    }

    // Simple growth model based on performance trend
    const growthRate = performance.ranking.trendDirection === 'up' ? 0.05 : 
                      performance.ranking.trendDirection === 'down' ? -0.03 : 0;

    return Math.round(baseLeads * Math.pow(1 + growthRate, month - 1));
  }

  private async getProviderTier(providerId: string): Promise<string> {
    const performance = await this.adminProviderRepository.getProviderPerformance(providerId);
    
    if (!performance) {
      return 'new';
    }

    const score = performance.ranking.performanceScore;
    if (score >= 90) return 'platinum';
    if (score >= 80) return 'gold';
    if (score >= 70) return 'silver';
    return 'bronze';
  }

  private async getMarketComparisonData(providerId: string): Promise<any> {
    // This would fetch market comparison data
    // For now, return mock data
    return {
      averageMarginPercentage: 8.5,
      competitorMargins: [7.2, 8.1, 9.3, 8.8],
      marketPosition: 'middle'
    };
  }

  private analyzeMarginPerformance(
    currentConfig: MarginConfiguration,
    performance: ProviderPerformance | undefined,
    marketData: any
  ): any {
    return {
      currentPerformance: performance?.ranking.performanceScore || 0,
      marketPosition: currentConfig.marginStructure.basePercentage > marketData.averageMarginPercentage ? 'above' : 'below',
      optimizationOpportunity: true
    };
  }

  private generateOptimizedConfiguration(
    currentConfig: MarginConfiguration,
    analysis: any,
    optimizationGoals: any
  ): MarginConfiguration {
    // Create optimized configuration based on analysis and goals
    const optimizedConfig = { ...currentConfig };

    // Apply optimization logic
    if (optimizationGoals.targetRevenue && analysis.optimizationOpportunity) {
      optimizedConfig.marginStructure.basePercentage = Math.min(
        optimizedConfig.marginStructure.basePercentage * 1.1, // 10% increase
        optimizationGoals.maxMarginPercentage || optimizedConfig.maximumMargin
      );
    }

    return optimizedConfig;
  }

  private async calculateOptimizationImpact(
    currentConfig: MarginConfiguration,
    recommendedConfig: MarginConfiguration,
    _performance: ProviderPerformance | undefined
  ): Promise<any> {
    const currentMargin = currentConfig.marginStructure.basePercentage;
    const recommendedMargin = recommendedConfig.marginStructure.basePercentage;

    const revenueIncrease = ((recommendedMargin - currentMargin) / currentMargin) * 100;

    return {
      revenueIncrease,
      competitivenessScore: 85, // Mock score
      providerSatisfactionImpact: revenueIncrease > 10 ? -5 : 0 // Negative if margin increase is too high
    };
  }
}