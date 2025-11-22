import { MetricsCollector } from '@caas/common';
import { AggregatedMetric } from './metrics-aggregator.js';

export interface PrometheusMetric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export class PrometheusExporter {
  private metricsCollector: MetricsCollector;
  private metricHelp: Map<string, string> = new Map();

  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector;
    this.setupMetricHelp();
  }

  public async getMetrics(): Promise<string> {
    const metrics = this.metricsCollector.getMetrics();
    const aggregatedMetrics = this.getAggregatedMetrics();
    
    const prometheusMetrics = [
      ...this.convertToPrometheusMetrics(metrics),
      ...this.convertAggregatedMetrics(aggregatedMetrics),
      ...this.getSystemMetrics(),
    ];

    return this.formatPrometheusOutput(prometheusMetrics);
  }

  private convertToPrometheusMetrics(metrics: any[]): PrometheusMetric[] {
    const prometheusMetrics: PrometheusMetric[] = [];
    const grouped = this.groupMetricsByName(metrics);

    for (const [name, metricList] of grouped.entries()) {
      const prometheusName = this.sanitizeMetricName(name);
      const help = this.metricHelp.get(name) || `Metric ${name}`;
      const type = this.determinePrometheusType(metricList[0]?.type);

      // For counter metrics, sum up values
      if (type === 'counter') {
        const totalValue = metricList.reduce((sum, m) => sum + m.value, 0);
        prometheusMetrics.push({
          name: prometheusName,
          help,
          type,
          value: totalValue,
          labels: metricList[0]?.labels,
        });
      } 
      // For gauge metrics, use latest value
      else if (type === 'gauge') {
        const latestMetric = metricList[metricList.length - 1];
        prometheusMetrics.push({
          name: prometheusName,
          help,
          type,
          value: latestMetric.value,
          labels: latestMetric.labels,
          timestamp: latestMetric.timestamp,
        });
      }
      // For histogram metrics, create histogram buckets
      else if (type === 'histogram') {
        const histogramMetrics = this.createHistogramMetrics(prometheusName, help, metricList);
        prometheusMetrics.push(...histogramMetrics);
      }
    }

    return prometheusMetrics;
  }

  private convertAggregatedMetrics(aggregatedMetrics: AggregatedMetric[]): PrometheusMetric[] {
    const prometheusMetrics: PrometheusMetric[] = [];

    for (const metric of aggregatedMetrics) {
      const baseName = this.sanitizeMetricName(metric.name);
      const help = this.metricHelp.get(metric.name) || `Aggregated metric ${metric.name}`;

      // Add multiple views of aggregated data
      prometheusMetrics.push(
        {
          name: `${baseName}_avg`,
          help: `${help} (average)`,
          type: 'gauge',
          value: metric.avg,
          labels: { window: metric.window, ...metric.labels },
          timestamp: metric.timestamp,
        },
        {
          name: `${baseName}_min`,
          help: `${help} (minimum)`,
          type: 'gauge',
          value: metric.min,
          labels: { window: metric.window, ...metric.labels },
          timestamp: metric.timestamp,
        },
        {
          name: `${baseName}_max`,
          help: `${help} (maximum)`,
          type: 'gauge',
          value: metric.max,
          labels: { window: metric.window, ...metric.labels },
          timestamp: metric.timestamp,
        },
        {
          name: `${baseName}_count`,
          help: `${help} (count)`,
          type: 'counter',
          value: metric.count,
          labels: { window: metric.window, ...metric.labels },
          timestamp: metric.timestamp,
        }
      );

      // Add percentiles for histogram/timer metrics
      if (metric.percentiles) {
        prometheusMetrics.push(
          {
            name: `${baseName}_p50`,
            help: `${help} (50th percentile)`,
            type: 'gauge',
            value: metric.percentiles.p50,
            labels: { window: metric.window, ...metric.labels },
            timestamp: metric.timestamp,
          },
          {
            name: `${baseName}_p90`,
            help: `${help} (90th percentile)`,
            type: 'gauge',
            value: metric.percentiles.p90,
            labels: { window: metric.window, ...metric.labels },
            timestamp: metric.timestamp,
          },
          {
            name: `${baseName}_p95`,
            help: `${help} (95th percentile)`,
            type: 'gauge',
            value: metric.percentiles.p95,
            labels: { window: metric.window, ...metric.labels },
            timestamp: metric.timestamp,
          },
          {
            name: `${baseName}_p99`,
            help: `${help} (99th percentile)`,
            type: 'gauge',
            value: metric.percentiles.p99,
            labels: { window: metric.window, ...metric.labels },
            timestamp: metric.timestamp,
          }
        );
      }
    }

    return prometheusMetrics;
  }

  private getSystemMetrics(): PrometheusMetric[] {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    return [
      {
        name: 'caas_process_memory_bytes',
        help: 'Process memory usage in bytes',
        type: 'gauge',
        value: memUsage.heapUsed,
        labels: { type: 'heap_used' },
      },
      {
        name: 'caas_process_memory_bytes',
        help: 'Process memory usage in bytes',
        type: 'gauge',
        value: memUsage.heapTotal,
        labels: { type: 'heap_total' },
      },
      {
        name: 'caas_process_memory_bytes',
        help: 'Process memory usage in bytes',
        type: 'gauge',
        value: memUsage.external,
        labels: { type: 'external' },
      },
      {
        name: 'caas_process_cpu_seconds_total',
        help: 'Process CPU usage in seconds',
        type: 'counter',
        value: cpuUsage.user / 1000000, // Convert microseconds to seconds
        labels: { type: 'user' },
      },
      {
        name: 'caas_process_cpu_seconds_total',
        help: 'Process CPU usage in seconds',
        type: 'counter',
        value: cpuUsage.system / 1000000,
        labels: { type: 'system' },
      },
      {
        name: 'caas_process_uptime_seconds',
        help: 'Process uptime in seconds',
        type: 'gauge',
        value: uptime,
      },
      {
        name: 'caas_process_start_time_seconds',
        help: 'Process start time in seconds since Unix epoch',
        type: 'gauge',
        value: Math.floor((Date.now() - uptime * 1000) / 1000),
      },
    ];
  }

  private createHistogramMetrics(name: string, help: string, metrics: any[]): PrometheusMetric[] {
    const buckets = [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    const values = metrics.map(m => m.value);
    
    const histogramMetrics: PrometheusMetric[] = [];
    
    // Create bucket counts
    for (const bucket of buckets) {
      const count = values.filter(v => v <= bucket).length;
      histogramMetrics.push({
        name: `${name}_bucket`,
        help: `${help} (histogram bucket)`,
        type: 'counter',
        value: count,
        labels: { le: bucket.toString() },
      });
    }

    // Add +Inf bucket
    histogramMetrics.push({
      name: `${name}_bucket`,
      help: `${help} (histogram bucket)`,
      type: 'counter',
      value: values.length,
      labels: { le: '+Inf' },
    });

    // Add count and sum
    histogramMetrics.push(
      {
        name: `${name}_count`,
        help: `${help} (histogram count)`,
        type: 'counter',
        value: values.length,
      },
      {
        name: `${name}_sum`,
        help: `${help} (histogram sum)`,
        type: 'counter',
        value: values.reduce((sum, v) => sum + v, 0),
      }
    );

    return histogramMetrics;
  }

  private groupMetricsByName(metrics: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();
    
    for (const metric of metrics) {
      if (!grouped.has(metric.name)) {
        grouped.set(metric.name, []);
      }
      grouped.get(metric.name)!.push(metric);
    }
    
    return grouped;
  }

  private getAggregatedMetrics(): AggregatedMetric[] {
    // This would typically come from MetricsAggregator
    // For now, return empty array to avoid circular dependency
    return [];
  }

  private sanitizeMetricName(name: string): string {
    // Convert to Prometheus naming convention
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[^a-zA-Z_]/, '_')
      .toLowerCase();
  }

  private determinePrometheusType(metricType: string): PrometheusMetric['type'] {
    switch (metricType) {
      case 'counter':
        return 'counter';
      case 'gauge':
        return 'gauge';
      case 'histogram':
      case 'timer':
        return 'histogram';
      default:
        return 'gauge';
    }
  }

  private formatPrometheusOutput(metrics: PrometheusMetric[]): string {
    const output: string[] = [];
    const metricGroups = new Map<string, PrometheusMetric[]>();

    // Group metrics by name
    for (const metric of metrics) {
      const baseName = metric.name.replace(/_bucket$|_count$|_sum$|_avg$|_min$|_max$|_p\d+$/, '');
      if (!metricGroups.has(baseName)) {
        metricGroups.set(baseName, []);
      }
      metricGroups.get(baseName)!.push(metric);
    }

    // Format each metric group
    for (const [baseName, groupMetrics] of metricGroups.entries()) {
      const firstMetric = groupMetrics[0];
      
      // Add HELP comment
      output.push(`# HELP ${firstMetric.name} ${firstMetric.help}`);
      
      // Add TYPE comment
      output.push(`# TYPE ${firstMetric.name} ${firstMetric.type}`);
      
      // Add metric lines
      for (const metric of groupMetrics) {
        const labelsStr = this.formatLabels(metric.labels);
        const timestampStr = metric.timestamp ? ` ${metric.timestamp}` : '';
        output.push(`${metric.name}${labelsStr} ${metric.value}${timestampStr}`);
      }
      
      output.push(''); // Empty line between metric groups
    }

    return output.join('\n');
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelPairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
      .join(',');
    
    return `{${labelPairs}}`;
  }

  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  private setupMetricHelp(): void {
    this.metricHelp.set('http_request_duration_ms', 'HTTP request duration in milliseconds');
    this.metricHelp.set('http_requests_total', 'Total number of HTTP requests');
    this.metricHelp.set('http_errors_total', 'Total number of HTTP errors');
    this.metricHelp.set('memory_usage_mb', 'Memory usage in megabytes');
    this.metricHelp.set('cpu_usage_percent', 'CPU usage percentage');
    this.metricHelp.set('active_connections', 'Number of active connections');
    this.metricHelp.set('database_query_duration_ms', 'Database query duration in milliseconds');
    this.metricHelp.set('loan_applications_total', 'Total number of loan applications');
    this.metricHelp.set('payments_total', 'Total number of payments processed');
    this.metricHelp.set('notification_delivery_duration_ms', 'Notification delivery duration in milliseconds');
    this.metricHelp.set('websocket_connections', 'Number of active WebSocket connections');
    this.metricHelp.set('events_published_total', 'Total number of events published');
  }

  // Method to add custom metric help
  public addMetricHelp(metricName: string, help: string): void {
    this.metricHelp.set(metricName, help);
  }

  // Method to export metrics in JSON format (for debugging)
  public async getMetricsJSON(): Promise<any> {
    const metrics = this.metricsCollector.getMetrics();
    const aggregatedMetrics = this.getAggregatedMetrics();
    
    return {
      timestamp: Date.now(),
      metrics: {
        raw: metrics.slice(-100), // Last 100 raw metrics
        aggregated: aggregatedMetrics.slice(-50), // Last 50 aggregated metrics
        system: this.getSystemMetrics(),
      },
      summary: this.metricsCollector.getMetricsSummary(),
    };
  }
}