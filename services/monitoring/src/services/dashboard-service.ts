import { Logger } from '@caas/common';
import { MetricsAggregator, AggregatedMetric } from './metrics-aggregator';
import { HealthMonitor, ServiceHealth } from './health-monitor';

export interface DashboardOverview {
  systemHealth: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    degradedServices: number;
  };
  performance: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
    throughput: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    diskUsage?: number;
    networkConnections?: number;
  };
  alerts: {
    active: number;
    critical: number;
    warnings: number;
    resolved24h: number;
  };
  topMetrics: AggregatedMetric[];
  recentEvents: Array<{
    timestamp: number;
    type: 'alert' | 'deployment' | 'error' | 'info';
    message: string;
    severity?: string;
    service?: string;
  }>;
  trends: {
    responseTime: TrendData;
    errorRate: TrendData;
    throughput: TrendData;
    memoryUsage: TrendData;
  };
}

export interface TrendData {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  sparkline: number[];
}

export interface ServiceDashboard {
  service: string;
  health: ServiceHealth;
  metrics: {
    responseTime: AggregatedMetric[];
    requestRate: AggregatedMetric[];
    errorRate: AggregatedMetric[];
    throughput: AggregatedMetric[];
  };
  alerts: Array<{
    id: string;
    severity: string;
    message: string;
    timestamp: number;
  }>;
  deployments: Array<{
    version: string;
    timestamp: number;
    status: 'success' | 'failed' | 'in_progress';
  }>;
  dependencies: Array<{
    service: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime: number;
  }>;
}

export class DashboardService {
  private metricsAggregator: MetricsAggregator;
  private healthMonitor: HealthMonitor;
  private logger: Logger;
  private recentEvents: Array<any> = [];
  private maxEvents = 100;

  constructor(
    metricsAggregator: MetricsAggregator,
    healthMonitor: HealthMonitor,
    logger: Logger
  ) {
    this.metricsAggregator = metricsAggregator;
    this.healthMonitor = healthMonitor;
    this.logger = logger;
  }

  public getOverview(): DashboardOverview {
    const systemHealth = this.getSystemHealthOverview();
    const performance = this.getPerformanceOverview();
    const resources = this.getResourcesOverview();
    const alerts = this.getAlertsOverview();
    const topMetrics = this.getTopMetrics();
    const trends = this.getTrendsOverview();

    return {
      systemHealth,
      performance,
      resources,
      alerts,
      topMetrics,
      recentEvents: this.getRecentEvents(),
      trends,
    };
  }

  private getSystemHealthOverview() {
    const health = this.healthMonitor.getOverallHealth();
    
    return {
      status: health.status,
      totalServices: health.summary.total,
      healthyServices: health.summary.healthy,
      unhealthyServices: health.summary.unhealthy,
      degradedServices: health.summary.degraded,
    };
  }

  private getPerformanceOverview() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Get performance metrics for the last hour
    const responseTimeMetrics = this.metricsAggregator.getAggregatedMetrics('response_time', '1h');
    const requestMetrics = this.metricsAggregator.getAggregatedMetrics('requests_total', '1h');
    const errorMetrics = this.metricsAggregator.getAggregatedMetrics('errors_total', '1h');

    const averageResponseTime = responseTimeMetrics.length > 0
      ? responseTimeMetrics.reduce((sum, m) => sum + m.avg, 0) / responseTimeMetrics.length
      : 0;

    const totalRequests = requestMetrics.reduce((sum, m) => sum + m.sum, 0);
    const totalErrors = errorMetrics.reduce((sum, m) => sum + m.sum, 0);
    
    const requestsPerMinute = totalRequests / 60; // Assuming 1-hour data
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const throughput = requestsPerMinute;

    return {
      averageResponseTime,
      requestsPerMinute,
      errorRate,
      throughput,
    };
  }

  private getResourcesOverview() {
    const memoryMetrics = this.metricsAggregator.getAggregatedMetrics('memory_usage_mb', '5m');
    const cpuMetrics = this.metricsAggregator.getAggregatedMetrics('cpu_usage_percent', '5m');

    const memoryUsage = memoryMetrics.length > 0 ? memoryMetrics[0].value : 0;
    const cpuUsage = cpuMetrics.length > 0 ? cpuMetrics[0].value : 0;

    return {
      memoryUsage,
      cpuUsage,
    };
  }

  private getAlertsOverview() {
    // This would integrate with AlertManager when available
    return {
      active: 0,
      critical: 0,
      warnings: 0,
      resolved24h: 0,
    };
  }

  private getTopMetrics(): AggregatedMetric[] {
    return this.metricsAggregator.getTopMetrics('1h', 10);
  }

  private getTrendsOverview() {
    const responseTimeTrend = this.metricsAggregator.getMetricTrends('response_time', '1h');
    const errorRateTrend = this.metricsAggregator.getMetricTrends('error_rate', '1h');
    const throughputTrend = this.metricsAggregator.getMetricTrends('requests_per_minute', '1h');
    const memoryTrend = this.metricsAggregator.getMetricTrends('memory_usage_mb', '1h');

    return {
      responseTime: this.convertToTrendData(responseTimeTrend, 'response_time'),
      errorRate: this.convertToTrendData(errorRateTrend, 'error_rate'),
      throughput: this.convertToTrendData(throughputTrend, 'throughput'),
      memoryUsage: this.convertToTrendData(memoryTrend, 'memory_usage_mb'),
    };
  }

  private convertToTrendData(trendData: any, metricName: string): TrendData {
    const sparkline = this.getSparklineData(metricName);
    
    return {
      current: trendData.current,
      previous: trendData.previous,
      change: trendData.change,
      changePercent: trendData.changePercent,
      trend: trendData.trend,
      sparkline,
    };
  }

  private getSparklineData(metricName: string): number[] {
    const metrics = this.metricsAggregator.getAggregatedMetrics(metricName, '1h');
    return metrics
      .slice(-20) // Last 20 data points
      .map(m => m.value);
  }

  private getRecentEvents() {
    return this.recentEvents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20); // Last 20 events
  }

  public getServiceMetrics(serviceName: string): ServiceDashboard {
    const health = this.healthMonitor.getServiceHealth(serviceName);
    const metrics = this.getServiceSpecificMetrics(serviceName);
    const alerts = this.getServiceAlerts(serviceName);
    const deployments = this.getServiceDeployments(serviceName);
    const dependencies = this.getServiceDependencies(serviceName);

    return {
      service: serviceName,
      health: health || this.createUnknownHealthStatus(serviceName),
      metrics,
      alerts,
      deployments,
      dependencies,
    };
  }

  private getServiceSpecificMetrics(serviceName: string) {
    const timeWindow = '1h';
    
    const responseTime = this.metricsAggregator.getServiceMetrics(serviceName, timeWindow)
      .filter(m => m.name.includes('response_time'));
    
    const requestRate = this.metricsAggregator.getServiceMetrics(serviceName, timeWindow)
      .filter(m => m.name.includes('requests'));
    
    const errorRate = this.metricsAggregator.getServiceMetrics(serviceName, timeWindow)
      .filter(m => m.name.includes('errors'));
    
    const throughput = this.metricsAggregator.getServiceMetrics(serviceName, timeWindow)
      .filter(m => m.name.includes('throughput'));

    return {
      responseTime,
      requestRate,
      errorRate,
      throughput,
    };
  }

  private getServiceAlerts(serviceName: string) {
    // This would integrate with AlertManager
    return [];
  }

  private getServiceDeployments(serviceName: string) {
    // This would integrate with deployment tracking
    return [];
  }

  private getServiceDependencies(serviceName: string) {
    // This would analyze service dependencies
    return [];
  }

  private createUnknownHealthStatus(serviceName: string): ServiceHealth {
    return {
      service: serviceName,
      name: serviceName,
      url: 'unknown',
      status: 'unhealthy',
      message: 'Service not registered for health monitoring',
      timestamp: Date.now(),
      consecutiveFailures: 0,
      uptime: 0,
      lastSuccessful: 0,
      availability: { last24h: 0, last7d: 0, last30d: 0 },
    };
  }

  // Event tracking
  public addEvent(event: {
    type: 'alert' | 'deployment' | 'error' | 'info';
    message: string;
    severity?: string;
    service?: string;
    metadata?: Record<string, any>;
  }): void {
    const eventWithTimestamp = {
      ...event,
      timestamp: Date.now(),
    };

    this.recentEvents.push(eventWithTimestamp);
    
    // Keep only recent events
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.splice(0, this.recentEvents.length - this.maxEvents);
    }

    this.logger.debug(`Dashboard event added: ${event.type}`, eventWithTimestamp);
  }

  // Real-time updates
  public getSystemStatus(): {
    status: string;
    uptime: number;
    version: string;
    lastUpdated: number;
    activeConnections: number;
    memoryUsage: number;
    cpuUsage: number;
  } {
    const health = this.healthMonitor.getOverallHealth();
    const memoryMetrics = this.metricsAggregator.getAggregatedMetrics('memory_usage_mb', '1m');
    const cpuMetrics = this.metricsAggregator.getAggregatedMetrics('cpu_usage_percent', '1m');

    return {
      status: health.status,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      lastUpdated: Date.now(),
      activeConnections: 0, // Would come from connection metrics
      memoryUsage: memoryMetrics.length > 0 ? memoryMetrics[0].value : 0,
      cpuUsage: cpuMetrics.length > 0 ? cpuMetrics[0].value : 0,
    };
  }

  public getMetricsSnapshot(timeWindow: string = '1h'): {
    totalMetrics: number;
    metricsPerSecond: number;
    topMetrics: AggregatedMetric[];
    systemMetrics: {
      memory: number;
      cpu: number;
      uptime: number;
    };
  } {
    const summary = this.metricsAggregator.getMetricsSummary(timeWindow);
    const topMetrics = this.metricsAggregator.getTopMetrics(timeWindow, 5);

    // Calculate metrics per second (rough estimate)
    const timeWindowMs = this.parseTimeWindow(timeWindow);
    const metricsPerSecond = summary.totalMetrics / (timeWindowMs / 1000);

    return {
      totalMetrics: summary.totalMetrics,
      metricsPerSecond,
      topMetrics,
      systemMetrics: {
        memory: summary.systemHealth.memoryUsage,
        cpu: summary.systemHealth.cpuUsage,
        uptime: process.uptime(),
      },
    };
  }

  private parseTimeWindow(timeWindow: string): number {
    const unit = timeWindow.slice(-1);
    const value = parseInt(timeWindow.slice(0, -1));

    switch (unit) {
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 60 * 60 * 1000; // Default to 1 hour
    }
  }

  // Export data for external dashboards
  public exportDashboardData(format: 'json' | 'csv' = 'json'): any {
    const overview = this.getOverview();
    const systemStats = this.healthMonitor.getServiceStats();
    const metricsStats = this.metricsAggregator.getMetricsStats();

    const data = {
      overview,
      systemStats,
      metricsStats,
      exportedAt: new Date().toISOString(),
      format,
    };

    if (format === 'csv') {
      // Convert to CSV format (simplified)
      return this.convertToCSV(data);
    }

    return data;
  }

  private convertToCSV(data: any): string {
    // Simplified CSV conversion - would need proper implementation
    const headers = ['timestamp', 'metric', 'value', 'status'];
    const rows = [headers.join(',')];
    
    // Add overview data
    const timestamp = new Date().toISOString();
    rows.push(`${timestamp},total_services,${data.overview.systemHealth.totalServices},info`);
    rows.push(`${timestamp},healthy_services,${data.overview.systemHealth.healthyServices},info`);
    rows.push(`${timestamp},memory_usage,${data.overview.resources.memoryUsage},info`);
    rows.push(`${timestamp},cpu_usage,${data.overview.resources.cpuUsage},info`);

    return rows.join('\n');
  }
}