import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { Logger } from './logging';

export interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  labels?: Record<string, string>;
  timestamp: number;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  duration?: number;
  timestamp: number;
  details?: Record<string, any>;
}

export interface AlertRule {
  name: string;
  condition: (metric: Metric) => boolean;
  threshold?: number;
  operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, Metric[]> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private alertRules: AlertRule[] = [];
  private timers: Map<string, number> = new Map();
  private logger: Logger;
  private maxMetricsHistory = 1000;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.setupDefaultAlerts();
  }

  // Counter metrics
  public incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      type: 'counter',
      labels,
      timestamp: Date.now(),
    };

    this.storeMetric(metric);
    this.checkAlerts(metric);
    this.emit('metric', metric);
  }

  // Gauge metrics
  public setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      type: 'gauge',
      labels,
      timestamp: Date.now(),
    };

    this.storeMetric(metric);
    this.checkAlerts(metric);
    this.emit('metric', metric);
  }

  // Histogram metrics
  public recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      type: 'histogram',
      labels,
      timestamp: Date.now(),
    };

    this.storeMetric(metric);
    this.checkAlerts(metric);
    this.emit('metric', metric);
  }

  // Timer utilities
  public startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  public endTimer(name: string, labels?: Record<string, string>): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      this.logger.warn(`Timer '${name}' not found or already ended`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);

    const metric: Metric = {
      name,
      value: duration,
      type: 'timer',
      labels,
      timestamp: Date.now(),
    };

    this.storeMetric(metric);
    this.checkAlerts(metric);
    this.emit('metric', metric);

    return duration;
  }

  // Performance timing decorator
  public async measureAsync<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    this.startTimer(name);
    try {
      const result = await fn();
      this.endTimer(name, labels);
      return result;
    } catch (error) {
      this.endTimer(name, { ...labels, status: 'error' });
      throw error;
    }
  }

  // Health checks
  public registerHealthCheck(name: string, checkFn: () => Promise<HealthCheck>): void {
    setInterval(async () => {
      try {
        const healthCheck = await checkFn();
        this.healthChecks.set(name, healthCheck);
        this.emit('healthCheck', healthCheck);

        if (healthCheck.status !== 'healthy') {
          this.logger.warn(`Health check '${name}' failed`, {
            status: healthCheck.status,
            message: healthCheck.message,
            details: healthCheck.details,
          });
        }
      } catch (error) {
        const healthCheck: HealthCheck = {
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Health check failed',
          timestamp: Date.now(),
        };
        
        this.healthChecks.set(name, healthCheck);
        this.logger.error(`Health check '${name}' threw error`, error);
      }
    }, 30000); // Check every 30 seconds
  }

  // Alert management
  public addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    this.logger.info(`Added alert rule: ${rule.name}`, { rule });
  }

  public removeAlertRule(name: string): void {
    this.alertRules = this.alertRules.filter(rule => rule.name !== name);
    this.logger.info(`Removed alert rule: ${name}`);
  }

  private checkAlerts(metric: Metric): void {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      try {
        if (rule.condition(metric)) {
          const alert = {
            rule: rule.name,
            metric: metric.name,
            value: metric.value,
            severity: rule.severity,
            threshold: rule.threshold,
            timestamp: Date.now(),
            message: `Alert triggered: ${rule.name} - ${metric.name} = ${metric.value}`,
          };

          this.emit('alert', alert);
          this.logger.warn(`Alert triggered: ${rule.name}`, alert);
        }
      } catch (error) {
        this.logger.error(`Error checking alert rule '${rule.name}'`, error);
      }
    }
  }

  private storeMetric(metric: Metric): void {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metricHistory = this.metrics.get(metric.name)!;
    metricHistory.push(metric);

    // Keep only recent metrics
    if (metricHistory.length > this.maxMetricsHistory) {
      metricHistory.splice(0, metricHistory.length - this.maxMetricsHistory);
    }
  }

  private setupDefaultAlerts(): void {
    // High memory usage
    this.addAlertRule({
      name: 'high_memory_usage',
      condition: (metric) => metric.name === 'memory_usage_mb' && metric.value > 1024,
      threshold: 1024,
      operator: 'gt',
      severity: 'high',
      enabled: true,
    });

    // High response time
    this.addAlertRule({
      name: 'high_response_time',
      condition: (metric) => metric.name.includes('response_time') && metric.value > 5000,
      threshold: 5000,
      operator: 'gt',
      severity: 'medium',
      enabled: true,
    });

    // High error rate
    this.addAlertRule({
      name: 'high_error_rate',
      condition: (metric) => metric.name === 'http_errors_per_minute' && metric.value > 10,
      threshold: 10,
      operator: 'gt',
      severity: 'critical',
      enabled: true,
    });
  }

  // System metrics collection
  public collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.setGauge('memory_usage_mb', Math.round(memUsage.heapUsed / 1024 / 1024));
    this.setGauge('memory_total_mb', Math.round(memUsage.heapTotal / 1024 / 1024));
    this.setGauge('memory_external_mb', Math.round(memUsage.external / 1024 / 1024));
    this.setGauge('cpu_user_time', cpuUsage.user);
    this.setGauge('cpu_system_time', cpuUsage.system);
    this.setGauge('uptime_seconds', process.uptime());
  }

  // Get metrics for reporting
  public getMetrics(name?: string, since?: number): Metric[] {
    if (name) {
      const metrics = this.metrics.get(name) || [];
      return since ? metrics.filter(m => m.timestamp >= since) : metrics;
    }

    const allMetrics: Metric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }

    return since ? allMetrics.filter(m => m.timestamp >= since) : allMetrics;
  }

  public getHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  public getOverallHealth(): 'healthy' | 'unhealthy' | 'degraded' {
    const checks = this.getHealthChecks();
    if (checks.length === 0) return 'healthy';

    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  // Metrics summary
  public getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const [name, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const recent = metrics.slice(-10); // Last 10 data points
      const values = recent.map(m => m.value);
      
      summary[name] = {
        count: metrics.length,
        latest: values[values.length - 1],
        average: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        type: recent[0].type,
      };
    }

    return summary;
  }

  // Start automatic system metrics collection
  public startSystemMetricsCollection(intervalMs: number = 60000): void {
    setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    this.logger.info(`Started system metrics collection with ${intervalMs}ms interval`);
  }
}

// Performance monitoring middleware
export function createPerformanceMiddleware(metrics: MetricsCollector) {
  return (req: any, res: any, next: any) => {
    const startTime = performance.now();
    const originalSend = res.send;

    res.send = function(data: any) {
      const duration = performance.now() - startTime;
      const statusCode = res.statusCode;
      
      metrics.recordHistogram('http_request_duration_ms', duration, {
        method: req.method,
        route: req.route?.path || req.path,
        status: statusCode.toString(),
      });

      metrics.incrementCounter('http_requests_total', 1, {
        method: req.method,
        status: statusCode.toString(),
      });

      if (statusCode >= 400) {
        metrics.incrementCounter('http_errors_total', 1, {
          method: req.method,
          status: statusCode.toString(),
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

// Factory function
export function createMetricsCollector(logger: Logger): MetricsCollector {
  return new MetricsCollector(logger);
}