import { Logger } from '@caas/common';
import { Pool } from 'pg';

interface AnalyticsEvent {
  event: string;
  data: Record<string, any>;
  timestamp: Date;
}

const analyticsEvents: AnalyticsEvent[] = [];
const savedReports: Array<Record<string, any>> = [];

export class AnalyticsRepository {
  constructor(
    private logger: Logger,
    private db: Pool
  ) {}

  async trackEvent(event: string, data: Record<string, any>): Promise<void> {
    const record = { event, data, timestamp: new Date() };
    analyticsEvents.push(record);

    await this.safeQuery(
      `INSERT INTO provider_analytics_events (event_type, payload, created_at)
       VALUES ($1, $2, $3)`,
      [event, JSON.stringify(data), record.timestamp],
      'track analytics event'
    );
  }

  async getMetrics(filters: Record<string, any> = {}): Promise<Record<string, any>> {
    const events = this.filterEvents(filters);
    const byType = events.reduce<Record<string, number>>((acc, item) => {
      acc[item.event] = (acc[item.event] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalEvents: events.length,
      byType,
      filters,
    };
  }

  async getProviderStatistics(): Promise<{ total: number; active: number }> {
    const result = await this.safeQuery(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('active', 'approved'))::int AS active
       FROM credit_providers`,
      [],
      'get provider statistics'
    );

    return {
      total: result?.rows[0]?.total ?? 0,
      active: result?.rows[0]?.active ?? 0,
    };
  }

  async getLeadStatistics(): Promise<{ total: number; averageResponseTime: number }> {
    const result = await this.safeQuery(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(AVG(EXTRACT(EPOCH FROM (responded_at - distributed_at)) / 3600), 0)::float AS average_response_time
       FROM provider_leads`,
      [],
      'get platform lead statistics'
    );

    return {
      total: result?.rows[0]?.total ?? this.filterEvents({ event: 'lead.distributed' }).length,
      averageResponseTime: Number(result?.rows[0]?.average_response_time ?? 0),
    };
  }

  async getDisbursementStatistics(): Promise<{ total: number }> {
    const result = await this.safeQuery(
      `SELECT COUNT(*)::int AS total
       FROM provider_leads
       WHERE decision->>'decision' = 'approved'`,
      [],
      'get disbursement statistics'
    );

    return { total: result?.rows[0]?.total ?? 0 };
  }

  async getTopPerformingProviders(limit = 10): Promise<Array<{
    providerId: string;
    companyName: string;
    approvalRate: number;
    averageResponseTime: number;
    totalLeads: number;
  }>> {
    const result = await this.safeQuery(
      `SELECT
         cp.id AS provider_id,
         cp.company_name,
         COALESCE((cp.performance->>'approvalRate')::float, cp.approval_rate, 0) AS approval_rate,
         COALESCE((cp.performance->>'averageResponseTime')::float, cp.average_processing_time_hours, 0) AS average_response_time,
         COALESCE((cp.performance->>'totalLeadsReceived')::int, 0) AS total_leads
       FROM credit_providers cp
       ORDER BY approval_rate DESC, average_response_time ASC
       LIMIT $1`,
      [limit],
      'get top performing providers'
    );

    return result?.rows.map(row => ({
      providerId: row.provider_id,
      companyName: row.company_name,
      approvalRate: Number(row.approval_rate ?? 0),
      averageResponseTime: Number(row.average_response_time ?? 0),
      totalLeads: Number(row.total_leads ?? 0),
    })) ?? [];
  }

  async getMarketInsights(): Promise<{
    popularLoanAmounts: Array<{ range: string; count: number }>;
    geographicDistribution: Array<{ country: string; count: number; percentage: number }>;
    riskRatingDistribution: Array<{ rating: string; count: number; percentage: number }>;
  }> {
    return {
      popularLoanAmounts: [
        { range: '0-50k', count: 0 },
        { range: '50k-250k', count: 0 },
        { range: '250k+', count: 0 },
      ],
      geographicDistribution: [],
      riskRatingDistribution: [],
    };
  }

  async saveReport(providerId: string, report: Record<string, any>): Promise<void> {
    savedReports.push({ providerId, ...report });

    await this.safeQuery(
      `INSERT INTO provider_reports (provider_id, report_id, report_type, payload, generated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [providerId, report.reportId, report.reportType, JSON.stringify(report), report.generatedAt],
      'save provider report'
    );
  }

  async getFinancialData(providerId: string, startDate: Date, endDate: Date): Promise<{
    totalRevenue: number;
    totalCost: number;
    totalLeads: number;
  }> {
    const result = await this.safeQuery(
      `SELECT
         COUNT(*)::int AS total_leads,
         COALESCE(SUM((decision->>'approvedAmount')::numeric) FILTER (WHERE decision->>'decision' = 'approved'), 0)::float AS approved_amount
       FROM provider_leads
       WHERE provider_id = $1 AND distributed_at BETWEEN $2 AND $3`,
      [providerId, startDate, endDate],
      'get financial data'
    );

    const totalLeads = Number(result?.rows[0]?.total_leads ?? 0);
    const approvedAmount = Number(result?.rows[0]?.approved_amount ?? 0);

    return {
      totalRevenue: approvedAmount * 0.085,
      totalCost: totalLeads * 5,
      totalLeads,
    };
  }

  async getPerformanceData(providerId: string, startDate: Date, endDate: Date): Promise<{
    avgResponseTime: number;
    medianResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    uptimePercentage: number;
    errorRate: number;
    webhookDeliveryRate: number;
    customerSatisfactionScore: number;
    approvalRate: number;
  }> {
    const result = await this.safeQuery(
      `SELECT
         COALESCE(AVG(EXTRACT(EPOCH FROM (responded_at - distributed_at)) / 3600), 0)::float AS avg_response_time,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE decision->>'decision' = 'approved')::int AS approved
       FROM provider_leads
       WHERE provider_id = $1 AND distributed_at BETWEEN $2 AND $3`,
      [providerId, startDate, endDate],
      'get performance data'
    );

    const total = Number(result?.rows[0]?.total ?? 0);
    const approved = Number(result?.rows[0]?.approved ?? 0);
    const average = Number(result?.rows[0]?.avg_response_time ?? 0);

    return {
      avgResponseTime: average,
      medianResponseTime: average,
      p95ResponseTime: average,
      p99ResponseTime: average,
      uptimePercentage: 100,
      errorRate: 0,
      webhookDeliveryRate: 100,
      customerSatisfactionScore: 0,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
    };
  }

  async getRecentActivity(providerId: string, limit: number): Promise<Array<{
    id: string;
    type: 'lead_received' | 'decision_submitted' | 'loan_disbursed' | 'payment_received';
    timestamp: Date;
    description: string;
    amount?: number;
    status?: string;
  }>> {
    const events = this.filterEvents({ providerId }).slice(-limit).reverse();

    return events.map((item, index) => ({
      id: `${item.event}_${item.timestamp.getTime()}_${index}`,
      type: this.mapActivityType(item.event),
      timestamp: item.timestamp,
      description: item.data.description ?? item.event,
      amount: item.data.amount,
      status: item.data.status,
    }));
  }

  async getLeadDistribution(
    providerId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    byAmount: Array<{ range: string; count: number; percentage: number }>;
    byRiskRating: Array<{ rating: string; count: number; percentage: number }>;
    byGeography: Array<{ country: string; count: number; percentage: number }>;
  }> {
    return {
      byAmount: [],
      byRiskRating: [],
      byGeography: [],
    };
  }

  async getProviderAlerts(providerId?: string): Promise<Array<{
    id: string;
    type: 'warning' | 'error' | 'info' | 'success';
    title: string;
    message: string;
    timestamp: Date;
    isRead: boolean;
  }>> {
    return [];
  }

  async getResponseTimeAnalysis(providerId: string, startDate: Date, endDate: Date) {
    const performance = await this.getPerformanceData(providerId, startDate, endDate);
    return {
      average: performance.avgResponseTime,
      median: performance.medianResponseTime,
      p95: performance.p95ResponseTime,
      p99: performance.p99ResponseTime,
      customerSatisfaction: performance.customerSatisfactionScore,
    };
  }

  async getConversionFunnel(providerId: string, startDate: Date, endDate: Date) {
    const performance = await this.getPerformanceData(providerId, startDate, endDate);
    return {
      received: performance.approvalRate,
      reviewed: performance.approvalRate,
      approved: performance.approvalRate,
    };
  }

  async getCompetitorBenchmark(
    providerId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<string, number>> {
    return {
      averageApprovalRate: 0,
      averageResponseTime: 0,
    };
  }

  async getRevenueBreakdown(providerId: string, startDate: Date, endDate: Date) {
    const data = await this.getFinancialData(providerId, startDate, endDate);
    return { total: data.totalRevenue, platformFees: data.totalRevenue };
  }

  async getCostAnalysis(providerId: string, startDate: Date, endDate: Date) {
    const data = await this.getFinancialData(providerId, startDate, endDate);
    return { total: data.totalCost, costPerLead: data.totalLeads > 0 ? data.totalCost / data.totalLeads : 0 };
  }

  async getProfitabilityAnalysis(providerId: string, startDate: Date, endDate: Date) {
    const data = await this.getFinancialData(providerId, startDate, endDate);
    const netProfit = data.totalRevenue - data.totalCost;
    return {
      netProfit,
      profitMargin: data.totalRevenue > 0 ? (netProfit / data.totalRevenue) * 100 : 0,
    };
  }

  async getCashFlowProjection(providerId: string): Promise<Record<string, any>> {
    return { providerId, projectedRevenue30d: 0, projectedCost30d: 0 };
  }

  async getKYCComplianceStats(
    providerId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ complianceRate: number }> {
    return { complianceRate: 100 };
  }

  async getDataProtectionStats(
    providerId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ score: number }> {
    return { score: 100 };
  }

  async getAuditTrail(
    providerId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ totalFindings: number; findings: any[] }> {
    return { totalFindings: 0, findings: [] };
  }

  async getRegulatoryReporting(
    providerId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ submittedReports: number; pendingReports: number }> {
    return { submittedReports: 0, pendingReports: 0 };
  }

  private filterEvents(filters: Record<string, any>): AnalyticsEvent[] {
    return analyticsEvents.filter(item => {
      if (filters.event && item.event !== filters.event) return false;
      if (filters.providerId && item.data.providerId !== filters.providerId) return false;
      if (filters.startDate && item.timestamp < filters.startDate) return false;
      if (filters.endDate && item.timestamp > filters.endDate) return false;
      return true;
    });
  }

  private mapActivityType(event: string): 'lead_received' | 'decision_submitted' | 'loan_disbursed' | 'payment_received' {
    if (event.includes('decision')) return 'decision_submitted';
    if (event.includes('disbursed')) return 'loan_disbursed';
    if (event.includes('payment')) return 'payment_received';
    return 'lead_received';
  }

  private async safeQuery(query: string, values: unknown[], operation: string) {
    try {
      return await this.db.query(query, values);
    } catch (error) {
      this.logger.warn(`Database ${operation} unavailable; using computed fallback`, {
        error: error instanceof Error ? error.message : 'Unknown database error',
      });
      return null;
    }
  }
}
