import { Logger } from '@caas/common';
import { 
  ProviderAnalytics,
  ProviderDashboardConfig,
  CreditProvider 
} from '../types/credit-provider';
import { CreditProviderRepository } from '../repositories/credit-provider-repository';
import { LeadRepository } from '../repositories/lead-repository';
import { AnalyticsRepository } from '../repositories/analytics-repository';

export interface DashboardData {
  overview: {
    totalLeads: number;
    pendingLeads: number;
    approvedLeads: number;
    rejectedLeads: number;
    conversionRate: number;
    averageResponseTime: number;
    revenue: {
      thisMonth: number;
      previousMonth: number;
      change: number;
    };
  };
  recentActivity: Array<{
    id: string;
    type: 'lead_received' | 'decision_submitted' | 'loan_disbursed' | 'payment_received';
    timestamp: Date;
    description: string;
    amount?: number;
    status?: string;
  }>;
  performanceMetrics: {
    approvalRate: {
      current: number;
      trend: 'up' | 'down' | 'stable';
      change: number;
    };
    averageProcessingTime: {
      current: number;
      trend: 'up' | 'down' | 'stable';
      change: number;
    };
    customerSatisfaction: {
      current: number;
      trend: 'up' | 'down' | 'stable';
      change: number;
    };
  };
  leadDistribution: {
    byAmount: Array<{ range: string; count: number; percentage: number }>;
    byRiskRating: Array<{ rating: string; count: number; percentage: number }>;
    byGeography: Array<{ country: string; count: number; percentage: number }>;
  };
  financialSummary: {
    totalRevenue: number;
    totalCost: number;
    netProfit: number;
    profitMargin: number;
    costPerLead: number;
    revenuePerLead: number;
  };
  alerts: Array<{
    id: string;
    type: 'warning' | 'error' | 'info' | 'success';
    title: string;
    message: string;
    timestamp: Date;
    isRead: boolean;
  }>;
}

export class ProviderAnalyticsService {
  private logger: Logger;
  private providerRepository: CreditProviderRepository;
  private leadRepository: LeadRepository;
  private analyticsRepository: AnalyticsRepository;

  constructor(
    logger: Logger,
    providerRepository: CreditProviderRepository,
    leadRepository: LeadRepository,
    analyticsRepository: AnalyticsRepository
  ) {
    this.logger = logger;
    this.providerRepository = providerRepository;
    this.leadRepository = leadRepository;
    this.analyticsRepository = analyticsRepository;
  }

  async getProviderAnalytics(
    providerId: string,
    period: string = '30d',
    metrics?: string[]
  ): Promise<ProviderAnalytics> {
    try {
      const provider = await this.providerRepository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      const { startDate, endDate } = this.parsePeriod(period);
      
      // Get lead statistics
      const leadStats = await this.leadRepository.getLeadStatistics(providerId, startDate, endDate);
      
      // Get financial metrics
      const financialMetrics = await this.calculateFinancialMetrics(providerId, startDate, endDate);
      
      // Get performance metrics
      const performanceMetrics = await this.calculatePerformanceMetrics(providerId, startDate, endDate);

      const analytics: ProviderAnalytics = {
        providerId,
        period: { startDate, endDate },
        metrics: {
          leadsReceived: leadStats.totalReceived,
          leadsProcessed: leadStats.totalProcessed,
          leadsApproved: leadStats.totalApproved,
          leadsRejected: leadStats.totalRejected,
          averageProcessingTime: leadStats.averageProcessingTime,
          averageApprovedAmount: leadStats.averageApprovedAmount,
          totalDisbursedAmount: leadStats.totalDisbursedAmount,
          conversionRate: leadStats.totalReceived > 0 ? (leadStats.totalApproved / leadStats.totalReceived) * 100 : 0,
          customerSatisfactionScore: performanceMetrics.customerSatisfactionScore,
        },
        performance: performanceMetrics,
        financialMetrics,
      };

      // Filter metrics if specific ones are requested
      if (metrics && metrics.length > 0) {
        return this.filterMetrics(analytics, metrics);
      }

      this.logger.info('Provider analytics retrieved', { providerId, period });
      
      return analytics;
    } catch (error) {
      this.logger.error('Failed to get provider analytics', { error, providerId });
      throw error;
    }
  }

  async getProviderDashboard(providerId: string): Promise<DashboardData> {
    try {
      const provider = await this.providerRepository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // Get current month data
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      // Get previous month data for comparisons
      const startOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const endOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

      // Overview data
      const overview = await this.getDashboardOverview(providerId, startOfMonth, endOfMonth, startOfPrevMonth, endOfPrevMonth);
      
      // Recent activity
      const recentActivity = await this.getRecentActivity(providerId, 20);
      
      // Performance metrics
      const performanceMetrics = await this.getPerformanceMetrics(providerId, startOfMonth, endOfMonth, startOfPrevMonth, endOfPrevMonth);
      
      // Lead distribution analysis
      const leadDistribution = await this.getLeadDistribution(providerId, startOfMonth, endOfMonth);
      
      // Financial summary
      const financialSummary = await this.getFinancialSummary(providerId, startOfMonth, endOfMonth);
      
      // Alerts
      const alerts = await this.getProviderAlerts(providerId);

      const dashboardData: DashboardData = {
        overview,
        recentActivity,
        performanceMetrics,
        leadDistribution,
        financialSummary,
        alerts,
      };

      this.logger.info('Provider dashboard data retrieved', { providerId });
      
      return dashboardData;
    } catch (error) {
      this.logger.error('Failed to get provider dashboard', { error, providerId });
      throw error;
    }
  }

  async getPlatformAnalytics(): Promise<{
    totalProviders: number;
    activeProviders: number;
    totalLeads: number;
    totalDisbursements: number;
    averageResponseTime: number;
    topPerformingProviders: Array<{
      providerId: string;
      companyName: string;
      approvalRate: number;
      averageResponseTime: number;
      totalLeads: number;
    }>;
    marketInsights: {
      popularLoanAmounts: Array<{ range: string; count: number }>;
      geographicDistribution: Array<{ country: string; count: number; percentage: number }>;
      riskRatingDistribution: Array<{ rating: string; count: number; percentage: number }>;
    };
  }> {
    try {
      const [
        providerStats,
        leadStats,
        disbursementStats,
        topProviders,
        marketData
      ] = await Promise.all([
        this.analyticsRepository.getProviderStatistics(),
        this.analyticsRepository.getLeadStatistics(),
        this.analyticsRepository.getDisbursementStatistics(),
        this.analyticsRepository.getTopPerformingProviders(10),
        this.analyticsRepository.getMarketInsights()
      ]);

      return {
        totalProviders: providerStats.total,
        activeProviders: providerStats.active,
        totalLeads: leadStats.total,
        totalDisbursements: disbursementStats.total,
        averageResponseTime: leadStats.averageResponseTime,
        topPerformingProviders: topProviders,
        marketInsights: marketData,
      };
    } catch (error) {
      this.logger.error('Failed to get platform analytics', { error });
      throw error;
    }
  }

  async generateProviderReport(
    providerId: string,
    reportType: 'performance' | 'financial' | 'compliance',
    period: string = '30d'
  ): Promise<{
    reportId: string;
    reportType: string;
    generatedAt: Date;
    period: { startDate: Date; endDate: Date };
    data: any;
    summary: {
      keyMetrics: Record<string, any>;
      insights: string[];
      recommendations: string[];
    };
  }> {
    try {
      const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { startDate, endDate } = this.parsePeriod(period);
      
      let reportData: any;
      let summary: any;

      switch (reportType) {
        case 'performance':
          reportData = await this.generatePerformanceReport(providerId, startDate, endDate);
          summary = this.generatePerformanceSummary(reportData);
          break;
        case 'financial':
          reportData = await this.generateFinancialReport(providerId, startDate, endDate);
          summary = this.generateFinancialSummary(reportData);
          break;
        case 'compliance':
          reportData = await this.generateComplianceReport(providerId, startDate, endDate);
          summary = this.generateComplianceSummary(reportData);
          break;
        default:
          throw new Error(`Unsupported report type: ${reportType}`);
      }

      const report = {
        reportId,
        reportType,
        generatedAt: new Date(),
        period: { startDate, endDate },
        data: reportData,
        summary,
      };

      // Save report to database
      await this.analyticsRepository.saveReport(providerId, report);

      this.logger.info('Provider report generated', { providerId, reportType, reportId });
      
      return report;
    } catch (error) {
      this.logger.error('Failed to generate provider report', { error, providerId, reportType });
      throw error;
    }
  }

  // Private helper methods

  private parsePeriod(period: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  private async calculateFinancialMetrics(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderAnalytics['financialMetrics']> {
    const financialData = await this.analyticsRepository.getFinancialData(providerId, startDate, endDate);
    
    return {
      totalRevenue: financialData.totalRevenue,
      totalCost: financialData.totalCost,
      profitMargin: financialData.totalRevenue > 0 ? ((financialData.totalRevenue - financialData.totalCost) / financialData.totalRevenue) * 100 : 0,
      costPerLead: financialData.totalLeads > 0 ? financialData.totalCost / financialData.totalLeads : 0,
      revenuePerLead: financialData.totalLeads > 0 ? financialData.totalRevenue / financialData.totalLeads : 0,
    };
  }

  private async calculatePerformanceMetrics(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ProviderAnalytics['performance']> {
    const performanceData = await this.analyticsRepository.getPerformanceData(providerId, startDate, endDate);
    
    return {
      responseTimeMetrics: {
        average: performanceData.avgResponseTime,
        median: performanceData.medianResponseTime,
        p95: performanceData.p95ResponseTime,
        p99: performanceData.p99ResponseTime,
      },
      uptimePercentage: performanceData.uptimePercentage,
      errorRate: performanceData.errorRate,
      webhookDeliveryRate: performanceData.webhookDeliveryRate,
      customerSatisfactionScore: performanceData.customerSatisfactionScore,
    };
  }

  private filterMetrics(analytics: ProviderAnalytics, requestedMetrics: string[]): ProviderAnalytics {
    const filtered = { ...analytics };
    
    // Only include requested metrics
    const metrics = filtered.metrics as any;
    const filteredMetrics: any = {};
    
    requestedMetrics.forEach(metric => {
      if (metrics[metric] !== undefined) {
        filteredMetrics[metric] = metrics[metric];
      }
    });
    
    filtered.metrics = filteredMetrics;
    
    return filtered;
  }

  private async getDashboardOverview(
    providerId: string,
    startOfMonth: Date,
    endOfMonth: Date,
    startOfPrevMonth: Date,
    endOfPrevMonth: Date
  ): Promise<DashboardData['overview']> {
    const [currentStats, previousStats] = await Promise.all([
      this.leadRepository.getLeadStatistics(providerId, startOfMonth, endOfMonth),
      this.leadRepository.getLeadStatistics(providerId, startOfPrevMonth, endOfPrevMonth)
    ]);

    const conversionRate = currentStats.totalReceived > 0 ? (currentStats.totalApproved / currentStats.totalReceived) * 100 : 0;
    
    const revenueChange = previousStats.totalRevenue > 0 
      ? ((currentStats.totalRevenue - previousStats.totalRevenue) / previousStats.totalRevenue) * 100 
      : 0;

    return {
      totalLeads: currentStats.totalReceived,
      pendingLeads: currentStats.totalPending,
      approvedLeads: currentStats.totalApproved,
      rejectedLeads: currentStats.totalRejected,
      conversionRate,
      averageResponseTime: currentStats.averageProcessingTime,
      revenue: {
        thisMonth: currentStats.totalRevenue,
        previousMonth: previousStats.totalRevenue,
        change: revenueChange,
      },
    };
  }

  private async getRecentActivity(providerId: string, limit: number): Promise<DashboardData['recentActivity']> {
    return await this.analyticsRepository.getRecentActivity(providerId, limit);
  }

  private async getPerformanceMetrics(
    providerId: string,
    startOfMonth: Date,
    endOfMonth: Date,
    startOfPrevMonth: Date,
    endOfPrevMonth: Date
  ): Promise<DashboardData['performanceMetrics']> {
    const [current, previous] = await Promise.all([
      this.analyticsRepository.getPerformanceData(providerId, startOfMonth, endOfMonth),
      this.analyticsRepository.getPerformanceData(providerId, startOfPrevMonth, endOfPrevMonth)
    ]);

    return {
      approvalRate: {
        current: current.approvalRate,
        trend: this.calculateTrend(current.approvalRate, previous.approvalRate),
        change: current.approvalRate - previous.approvalRate,
      },
      averageProcessingTime: {
        current: current.avgResponseTime,
        trend: this.calculateTrend(previous.avgResponseTime, current.avgResponseTime), // Inverted because lower is better
        change: current.avgResponseTime - previous.avgResponseTime,
      },
      customerSatisfaction: {
        current: current.customerSatisfactionScore,
        trend: this.calculateTrend(current.customerSatisfactionScore, previous.customerSatisfactionScore),
        change: current.customerSatisfactionScore - previous.customerSatisfactionScore,
      },
    };
  }

  private async getLeadDistribution(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardData['leadDistribution']> {
    return await this.analyticsRepository.getLeadDistribution(providerId, startDate, endDate);
  }

  private async getFinancialSummary(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardData['financialSummary']> {
    const financialData = await this.analyticsRepository.getFinancialData(providerId, startDate, endDate);
    
    return {
      totalRevenue: financialData.totalRevenue,
      totalCost: financialData.totalCost,
      netProfit: financialData.totalRevenue - financialData.totalCost,
      profitMargin: financialData.totalRevenue > 0 ? ((financialData.totalRevenue - financialData.totalCost) / financialData.totalRevenue) * 100 : 0,
      costPerLead: financialData.totalLeads > 0 ? financialData.totalCost / financialData.totalLeads : 0,
      revenuePerLead: financialData.totalLeads > 0 ? financialData.totalRevenue / financialData.totalLeads : 0,
    };
  }

  private async getProviderAlerts(providerId: string): Promise<DashboardData['alerts']> {
    return await this.analyticsRepository.getProviderAlerts(providerId);
  }

  private calculateTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    const threshold = 0.05; // 5% threshold for considering stable
    const change = Math.abs(current - previous) / Math.max(previous, 1);
    
    if (change < threshold) return 'stable';
    return current > previous ? 'up' : 'down';
  }

  private async generatePerformanceReport(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    return {
      leadMetrics: await this.leadRepository.getLeadStatistics(providerId, startDate, endDate),
      responseTimeAnalysis: await this.analyticsRepository.getResponseTimeAnalysis(providerId, startDate, endDate),
      conversionFunnel: await this.analyticsRepository.getConversionFunnel(providerId, startDate, endDate),
      competitorBenchmark: await this.analyticsRepository.getCompetitorBenchmark(providerId, startDate, endDate),
    };
  }

  private async generateFinancialReport(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    return {
      revenueBreakdown: await this.analyticsRepository.getRevenueBreakdown(providerId, startDate, endDate),
      costAnalysis: await this.analyticsRepository.getCostAnalysis(providerId, startDate, endDate),
      profitabilityAnalysis: await this.analyticsRepository.getProfitabilityAnalysis(providerId, startDate, endDate),
      cashFlowProjection: await this.analyticsRepository.getCashFlowProjection(providerId),
    };
  }

  private async generateComplianceReport(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    return {
      kycCompliance: await this.analyticsRepository.getKYCComplianceStats(providerId, startDate, endDate),
      dataProtection: await this.analyticsRepository.getDataProtectionStats(providerId, startDate, endDate),
      auditTrail: await this.analyticsRepository.getAuditTrail(providerId, startDate, endDate),
      regulatoryReporting: await this.analyticsRepository.getRegulatoryReporting(providerId, startDate, endDate),
    };
  }

  private generatePerformanceSummary(data: any): { keyMetrics: Record<string, any>; insights: string[]; recommendations: string[] } {
    const keyMetrics = {
      totalLeads: data.leadMetrics.totalReceived,
      conversionRate: data.leadMetrics.totalReceived > 0 ? (data.leadMetrics.totalApproved / data.leadMetrics.totalReceived) * 100 : 0,
      averageResponseTime: data.responseTimeAnalysis.average,
      customerSatisfaction: data.responseTimeAnalysis.customerSatisfaction,
    };

    const insights = [
      `Processed ${data.leadMetrics.totalReceived} leads with ${keyMetrics.conversionRate.toFixed(1)}% approval rate`,
      `Average response time: ${keyMetrics.averageResponseTime.toFixed(1)} hours`,
      `Customer satisfaction score: ${keyMetrics.customerSatisfaction}/5.0`,
    ];

    const recommendations = [];
    if (keyMetrics.conversionRate < 30) {
      recommendations.push('Consider reviewing approval criteria to improve conversion rate');
    }
    if (keyMetrics.averageResponseTime > 24) {
      recommendations.push('Work on reducing response time to improve customer experience');
    }
    if (keyMetrics.customerSatisfaction < 4.0) {
      recommendations.push('Focus on improving customer service quality');
    }

    return { keyMetrics, insights, recommendations };
  }

  private generateFinancialSummary(data: any): { keyMetrics: Record<string, any>; insights: string[]; recommendations: string[] } {
    const keyMetrics = {
      totalRevenue: data.revenueBreakdown.total,
      totalCost: data.costAnalysis.total,
      netProfit: data.profitabilityAnalysis.netProfit,
      profitMargin: data.profitabilityAnalysis.profitMargin,
    };

    const insights = [
      `Generated $${keyMetrics.totalRevenue.toLocaleString()} in revenue`,
      `Operating costs: $${keyMetrics.totalCost.toLocaleString()}`,
      `Net profit: $${keyMetrics.netProfit.toLocaleString()} (${keyMetrics.profitMargin.toFixed(1)}% margin)`,
    ];

    const recommendations = [];
    if (keyMetrics.profitMargin < 10) {
      recommendations.push('Consider optimizing operational costs to improve profit margins');
    }
    if (data.costAnalysis.costPerLead > 20) {
      recommendations.push('Explore ways to reduce customer acquisition costs');
    }

    return { keyMetrics, insights, recommendations };
  }

  private generateComplianceSummary(data: any): { keyMetrics: Record<string, any>; insights: string[]; recommendations: string[] } {
    const keyMetrics = {
      kycComplianceRate: data.kycCompliance.complianceRate,
      dataProtectionScore: data.dataProtection.score,
      auditFindings: data.auditTrail.totalFindings,
      regulatoryReports: data.regulatoryReporting.submittedReports,
    };

    const insights = [
      `KYC compliance rate: ${keyMetrics.kycComplianceRate}%`,
      `Data protection score: ${keyMetrics.dataProtectionScore}/100`,
      `Audit findings: ${keyMetrics.auditFindings}`,
    ];

    const recommendations = [];
    if (keyMetrics.kycComplianceRate < 95) {
      recommendations.push('Improve KYC processes to ensure full compliance');
    }
    if (keyMetrics.dataProtectionScore < 80) {
      recommendations.push('Strengthen data protection measures');
    }
    if (keyMetrics.auditFindings > 5) {
      recommendations.push('Address audit findings to improve compliance posture');
    }

    return { keyMetrics, insights, recommendations };
  }
}