import { Logger, MetricsCollector, Metric } from '@caas/common';

export interface AggregatedMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  value: number;
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  percentiles?: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  labels?: Record<string, string>;
  timestamp: number;
  window: string; // '1m', '5m', '1h', '1d'
}

export interface MetricWindow {
  start: number;
  end: number;
  duration: number;
  name: string;
}

export class MetricsAggregator {
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private aggregationWindows: MetricWindow[] = [
    { start: 0, end: 0, duration: 60 * 1000, name: '1m' },      // 1 minute
    { start: 0, end: 0, duration: 5 * 60 * 1000, name: '5m' },  // 5 minutes
    { start: 0, end: 0, duration: 60 * 60 * 1000, name: '1h' }, // 1 hour
    { start: 0, end: 0, duration: 24 * 60 * 60 * 1000, name: '1d' }, // 1 day
  ];
  private aggregatedMetrics: Map<string, AggregatedMetric[]> = new Map();

  constructor(metricsCollector: MetricsCollector, logger: Logger) {
    this.metricsCollector = metricsCollector;
    this.logger = logger;
    this.startAggregation();
  }

  private startAggregation(): void {
    // Aggregate metrics every minute
    setInterval(() => {
      this.aggregateMetrics();
    }, 60 * 1000);

    this.logger.info('Started metrics aggregation');
  }

  private aggregateMetrics(): void {
    const now = Date.now();
    
    for (const window of this.aggregationWindows) {
      window.end = now;
      window.start = now - window.duration;
      
      this.aggregateMetricsForWindow(window);
    }
  }

  private aggregateMetricsForWindow(window: MetricWindow): void {
    try {
      const metrics = this.metricsCollector.getMetrics(undefined, window.start);
      const groupedMetrics = this.groupMetricsByName(metrics);

      for (const [metricName, metricList] of groupedMetrics.entries()) {
        const aggregated = this.calculateAggregation(metricName, metricList, window);
        this.storeAggregatedMetric(aggregated);
      }
    } catch (error) {
      this.logger.error(`Error aggregating metrics for window ${window.name}`, error);
    }
  }

  private groupMetricsByName(metrics: Metric[]): Map<string, Metric[]> {
    const grouped = new Map<string, Metric[]>();
    
    for (const metric of metrics) {
      const key = this.getMetricKey(metric);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    }
    
    return grouped;
  }

  private getMetricKey(metric: Metric): string {
    const labelString = metric.labels 
      ? Object.entries(metric.labels)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      : '';
    
    return `${metric.name}${labelString ? `{${labelString}}` : ''}`;
  }

  private calculateAggregation(name: string, metrics: Metric[], window: MetricWindow): AggregatedMetric {
    const values = metrics.map(m => m.value);
    const sortedValues = [...values].sort((a, b) => a - b);
    
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    const avg = count > 0 ? sum / count : 0;
    const min = count > 0 ? Math.min(...values) : 0;
    const max = count > 0 ? Math.max(...values) : 0;

    // Calculate percentiles for histogram/timer metrics
    let percentiles: AggregatedMetric['percentiles'];
    const firstMetric = metrics[0];
    
    if (firstMetric?.type === 'histogram' || firstMetric?.type === 'timer') {
      percentiles = {
        p50: this.calculatePercentile(sortedValues, 0.50),
        p90: this.calculatePercentile(sortedValues, 0.90),
        p95: this.calculatePercentile(sortedValues, 0.95),
        p99: this.calculatePercentile(sortedValues, 0.99),
      };
    }

    return {
      name: firstMetric?.name || name,
      type: firstMetric?.type || 'gauge',
      value: avg, // Use average as primary value
      count,
      min,
      max,
      avg,
      sum,
      percentiles,
      labels: firstMetric?.labels,
      timestamp: window.end,
      window: window.name,
    };
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private storeAggregatedMetric(metric: AggregatedMetric): void {
    const key = `${metric.name}_${metric.window}`;
    
    if (!this.aggregatedMetrics.has(key)) {
      this.aggregatedMetrics.set(key, []);
    }
    
    const metrics = this.aggregatedMetrics.get(key)!;
    metrics.push(metric);
    
    // Keep only recent aggregations (last 100 data points)
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
  }

  // Public methods
  public getAggregatedMetrics(
    metricName?: string,
    window?: string,
    since?: number
  ): AggregatedMetric[] {
    const allMetrics: AggregatedMetric[] = [];
    
    for (const [key, metrics] of this.aggregatedMetrics.entries()) {
      const [name, windowName] = key.split('_');
      
      if (metricName && !name.includes(metricName)) continue;
      if (window && windowName !== window) continue;
      
      const filteredMetrics = since 
        ? metrics.filter(m => m.timestamp >= since)
        : metrics;
      
      allMetrics.push(...filteredMetrics);
    }
    
    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getMetricTrends(metricName: string, window: string = '1h'): {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  } {
    const metrics = this.getAggregatedMetrics(metricName, window);
    
    if (metrics.length < 2) {
      return {
        current: metrics[0]?.value || 0,
        previous: 0,
        change: 0,
        changePercent: 0,
        trend: 'stable',
      };
    }
    
    const current = metrics[0].value;
    const previous = metrics[1].value;
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(changePercent) > 5) { // 5% threshold
      trend = changePercent > 0 ? 'up' : 'down';
    }
    
    return { current, previous, change, changePercent, trend };
  }

  public getTopMetrics(
    window: string = '1h',
    limit: number = 10,
    sortBy: 'value' | 'count' | 'avg' = 'value'
  ): AggregatedMetric[] {
    const metrics = this.getAggregatedMetrics(undefined, window);
    
    return metrics
      .sort((a, b) => b[sortBy] - a[sortBy])
      .slice(0, limit);
  }

  public getMetricSummary(window: string = '1h'): {
    totalMetrics: number;
    uniqueMetrics: number;
    topMetrics: AggregatedMetric[];
    systemHealth: {
      memoryUsage: number;
      cpuUsage: number;
      activeConnections: number;
    };
  } {
    const metrics = this.getAggregatedMetrics(undefined, window);
    const uniqueNames = new Set(metrics.map(m => m.name));
    const topMetrics = this.getTopMetrics(window, 5);
    
    // Get system health metrics
    const memoryMetric = metrics.find(m => m.name === 'memory_usage_mb');
    const cpuMetric = metrics.find(m => m.name === 'cpu_usage_percent');
    const connectionsMetric = metrics.find(m => m.name === 'active_connections');
    
    return {
      totalMetrics: metrics.length,
      uniqueMetrics: uniqueNames.size,
      topMetrics,
      systemHealth: {
        memoryUsage: memoryMetric?.value || 0,
        cpuUsage: cpuMetric?.value || 0,
        activeConnections: connectionsMetric?.value || 0,
      },
    };
  }

  public getServiceMetrics(serviceName: string, window: string = '1h'): AggregatedMetric[] {
    const metrics = this.getAggregatedMetrics(undefined, window);
    
    return metrics.filter(metric => 
      metric.labels?.service === serviceName ||
      metric.name.includes(serviceName)
    );
  }

  public getAlertableMetrics(): AggregatedMetric[] {
    const recentMetrics = this.getAggregatedMetrics(undefined, '5m');
    
    // Return metrics that might trigger alerts
    return recentMetrics.filter(metric => {
      if (metric.name.includes('error') && metric.value > 0) return true;
      if (metric.name.includes('response_time') && metric.value > 5000) return true;
      if (metric.name === 'memory_usage_mb' && metric.value > 1024) return true;
      if (metric.name === 'cpu_usage_percent' && metric.value > 80) return true;
      return false;
    });
  }

  public getMetricsStats(): {
    aggregationWindows: string[];
    totalAggregatedMetrics: number;
    memoryUsage: {
      aggregatedMetrics: number;
      estimatedSizeMB: number;
    };
  } {
    let totalMetrics = 0;
    for (const metrics of this.aggregatedMetrics.values()) {
      totalMetrics += metrics.length;
    }
    
    // Rough estimate of memory usage
    const estimatedSizeMB = (totalMetrics * 500) / (1024 * 1024); // ~500 bytes per metric
    
    return {
      aggregationWindows: this.aggregationWindows.map(w => w.name),
      totalAggregatedMetrics: totalMetrics,
      memoryUsage: {
        aggregatedMetrics: totalMetrics,
        estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      },
    };
  }
}