import pino from 'pino';
import { CacheService } from './cache-service.js';
import { RedisClient } from './redis-client.js';

const logger = pino({ name: 'cache-monitoring-service' });

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  memoryUsage: number;
  connectedClients: number;
  commandsProcessed: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  evictedKeys: number;
  expiredKeys: number;
}

export interface CacheHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  redis: {
    connected: boolean;
    latency: number;
    memoryUsage: number;
    memoryFragmentationRatio: number;
  };
  cache: {
    hitRate: number;
    errorRate: number;
    responseTime: number;
  };
  issues: string[];
  timestamp: Date;
}

export interface AlertRule {
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number; // seconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export interface Alert {
  id: string;
  rule: AlertRule;
  value: number;
  triggeredAt: Date;
  resolvedAt?: Date;
  status: 'active' | 'resolved';
  message: string;
}

export class CacheMonitoringService {
  private cache: CacheService;
  private redisClient: RedisClient;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private metricsHistory: Array<{ timestamp: Date; metrics: CacheMetrics }> = [];
  private readonly METRICS_RETENTION_HOURS = 24;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(cache: CacheService, redisClient: RedisClient) {
    this.cache = cache;
    this.redisClient = redisClient;
    this.setupDefaultAlertRules();
    this.startHealthChecks();
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        name: 'High Error Rate',
        metric: 'errorRate',
        operator: 'gt',
        threshold: 0.05, // 5%
        duration: 300, // 5 minutes
        severity: 'high',
        enabled: true
      },
      {
        name: 'Low Hit Rate',
        metric: 'hitRate',
        operator: 'lt',
        threshold: 0.7, // 70%
        duration: 600, // 10 minutes
        severity: 'medium',
        enabled: true
      },
      {
        name: 'High Memory Usage',
        metric: 'memoryUsage',
        operator: 'gt',
        threshold: 0.85, // 85%
        duration: 180, // 3 minutes
        severity: 'high',
        enabled: true
      },
      {
        name: 'High Redis Latency',
        metric: 'redisLatency',
        operator: 'gt',
        threshold: 100, // 100ms
        duration: 300, // 5 minutes
        severity: 'medium',
        enabled: true
      },
      {
        name: 'Memory Fragmentation',
        metric: 'memoryFragmentationRatio',
        operator: 'gt',
        threshold: 1.5,
        duration: 600, // 10 minutes
        severity: 'medium',
        enabled: true
      },
      {
        name: 'Redis Connection Lost',
        metric: 'redisConnected',
        operator: 'eq',
        threshold: 0, // false
        duration: 30, // 30 seconds
        severity: 'critical',
        enabled: true
      }
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.name, rule);
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error({ error }, 'Health check failed');
      }
    }, this.HEALTH_CHECK_INTERVAL);

    logger.info({ interval: this.HEALTH_CHECK_INTERVAL }, 'Cache health checks started');
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logger.info('Cache health checks stopped');
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<CacheHealthStatus> {
    try {
      const startTime = Date.now();
      
      // Redis health check
      const redisHealth = await this.redisClient.healthCheck();
      const redisInfo = await this.redisClient.getInfo();
      
      // Cache statistics
      const cacheStats = this.cache.getStats();
      
      // Calculate metrics
      const memoryUsage = redisInfo.memory?.used_memory || 0;
      const maxMemory = redisInfo.memory?.maxmemory || Number.MAX_SAFE_INTEGER;
      const memoryUsageRatio = maxMemory > 0 ? memoryUsage / maxMemory : 0;
      const memoryFragmentationRatio = redisInfo.memory?.mem_fragmentation_ratio || 1;
      
      const healthCheckDuration = Date.now() - startTime;
      
      // Determine overall health status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      const issues: string[] = [];
      
      if (redisHealth.status !== 'healthy') {
        status = 'unhealthy';
        issues.push('Redis connection unhealthy');
      }
      
      if (cacheStats.hitRate < 0.5) {
        status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
        issues.push('Low cache hit rate');
      }
      
      if (memoryUsageRatio > 0.9) {
        status = 'unhealthy';
        issues.push('High memory usage');
      } else if (memoryUsageRatio > 0.8) {
        status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
        issues.push('Memory usage warning');
      }
      
      if (redisHealth.latency > 50) {
        status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
        issues.push('High Redis latency');
      }

      const healthStatus: CacheHealthStatus = {
        status,
        redis: {
          connected: redisHealth.status === 'healthy',
          latency: redisHealth.latency,
          memoryUsage: memoryUsageRatio,
          memoryFragmentationRatio
        },
        cache: {
          hitRate: cacheStats.hitRate,
          errorRate: cacheStats.errors / (cacheStats.hits + cacheStats.misses + cacheStats.errors),
          responseTime: healthCheckDuration
        },
        issues,
        timestamp: new Date()
      };

      // Check alert rules
      await this.checkAlertRules(healthStatus, redisInfo);

      return healthStatus;
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      return {
        status: 'unhealthy',
        redis: {
          connected: false,
          latency: -1,
          memoryUsage: 0,
          memoryFragmentationRatio: 1
        },
        cache: {
          hitRate: 0,
          errorRate: 1,
          responseTime: -1
        },
        issues: ['Health check failed'],
        timestamp: new Date()
      };
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  async getMetrics(): Promise<CacheMetrics> {
    try {
      const cacheStats = this.cache.getStats();
      const redisInfo = await this.redisClient.getInfo();
      
      return {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        sets: cacheStats.sets,
        deletes: cacheStats.deletes,
        errors: cacheStats.errors,
        hitRate: cacheStats.hitRate,
        memoryUsage: redisInfo.memory?.used_memory || 0,
        connectedClients: redisInfo.clients?.connected_clients || 0,
        commandsProcessed: redisInfo.stats?.total_commands_processed || 0,
        keyspaceHits: redisInfo.stats?.keyspace_hits || 0,
        keyspaceMisses: redisInfo.stats?.keyspace_misses || 0,
        evictedKeys: redisInfo.stats?.evicted_keys || 0,
        expiredKeys: redisInfo.stats?.expired_keys || 0
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cache metrics');
      throw error;
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 24): Array<{ timestamp: Date; metrics: CacheMetrics }> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(entry => entry.timestamp >= cutoffTime);
  }

  /**
   * Record metrics for historical tracking
   */
  async recordMetrics(): Promise<void> {
    try {
      const metrics = await this.getMetrics();
      const entry = {
        timestamp: new Date(),
        metrics
      };

      this.metricsHistory.push(entry);

      // Clean up old metrics
      const cutoffTime = new Date(Date.now() - this.METRICS_RETENTION_HOURS * 60 * 60 * 1000);
      this.metricsHistory = this.metricsHistory.filter(entry => entry.timestamp >= cutoffTime);

      logger.debug({ metricsCount: this.metricsHistory.length }, 'Metrics recorded');
    } catch (error) {
      logger.error({ error }, 'Failed to record metrics');
    }
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.name, rule);
    logger.info({ rule: rule.name }, 'Alert rule added');
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(name: string): boolean {
    const removed = this.alertRules.delete(name);
    if (removed) {
      logger.info({ rule: name }, 'Alert rule removed');
    }
    return removed;
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.status === 'active');
  }

  /**
   * Get alert history
   */
  getAlertHistory(hours: number = 24): Alert[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.triggeredAt >= cutoffTime);
  }

  /**
   * Check alert rules against current metrics
   */
  private async checkAlertRules(healthStatus: CacheHealthStatus, redisInfo: any): Promise<void> {
    try {
      const currentValues: Record<string, number> = {
        hitRate: healthStatus.cache.hitRate,
        errorRate: healthStatus.cache.errorRate,
        memoryUsage: healthStatus.redis.memoryUsage,
        redisLatency: healthStatus.redis.latency,
        memoryFragmentationRatio: healthStatus.redis.memoryFragmentationRatio,
        redisConnected: healthStatus.redis.connected ? 1 : 0,
        responseTime: healthStatus.cache.responseTime
      };

      for (const [ruleName, rule] of this.alertRules) {
        if (!rule.enabled) continue;

        const currentValue = currentValues[rule.metric];
        if (currentValue === undefined) continue;

        const shouldAlert = this.evaluateAlertRule(rule, currentValue);
        const alertId = `${ruleName}_${rule.metric}`;
        const existingAlert = this.activeAlerts.get(alertId);

        if (shouldAlert && !existingAlert) {
          // Create new alert
          const alert: Alert = {
            id: alertId,
            rule,
            value: currentValue,
            triggeredAt: new Date(),
            status: 'active',
            message: `${rule.name}: ${rule.metric} is ${rule.operator} ${rule.threshold} (current: ${currentValue})`
          };

          this.activeAlerts.set(alertId, alert);
          await this.handleAlert(alert);
        } else if (!shouldAlert && existingAlert && existingAlert.status === 'active') {
          // Resolve existing alert
          existingAlert.status = 'resolved';
          existingAlert.resolvedAt = new Date();
          await this.handleAlertResolution(existingAlert);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check alert rules');
    }
  }

  /**
   * Evaluate if alert rule should trigger
   */
  private evaluateAlertRule(rule: AlertRule, value: number): boolean {
    switch (rule.operator) {
      case 'gt': return value > rule.threshold;
      case 'gte': return value >= rule.threshold;
      case 'lt': return value < rule.threshold;
      case 'lte': return value <= rule.threshold;
      case 'eq': return value === rule.threshold;
      default: return false;
    }
  }

  /**
   * Handle alert trigger
   */
  private async handleAlert(alert: Alert): Promise<void> {
    try {
      logger.warn({
        alert: alert.id,
        rule: alert.rule.name,
        severity: alert.rule.severity,
        value: alert.value,
        threshold: alert.rule.threshold
      }, alert.message);

      // In production, this would send notifications (email, Slack, PagerDuty, etc.)
      // await this.sendAlertNotification(alert);
      
      // Store alert in cache for persistence
      const alertKey = `alert:${alert.id}`;
      await this.cache.set(alertKey, alert, 7 * 24 * 60 * 60); // 7 days
    } catch (error) {
      logger.error({ error, alert: alert.id }, 'Failed to handle alert');
    }
  }

  /**
   * Handle alert resolution
   */
  private async handleAlertResolution(alert: Alert): Promise<void> {
    try {
      const duration = alert.resolvedAt && alert.triggeredAt ? 
        alert.resolvedAt.getTime() - alert.triggeredAt.getTime() : 0;

      logger.info({
        alert: alert.id,
        rule: alert.rule.name,
        duration: duration / 1000 // seconds
      }, `Alert resolved: ${alert.rule.name}`);

      // In production, this would send resolution notifications
      // await this.sendAlertResolutionNotification(alert);

      // Update alert in cache
      const alertKey = `alert:${alert.id}`;
      await this.cache.set(alertKey, alert, 7 * 24 * 60 * 60); // 7 days
    } catch (error) {
      logger.error({ error, alert: alert.id }, 'Failed to handle alert resolution');
    }
  }

  /**
   * Get system resource usage
   */
  async getSystemResources(): Promise<{
    memory: {
      used: number;
      total: number;
      fragmentation: number;
    };
    cpu: {
      usage: number;
    };
    connections: {
      active: number;
      total: number;
    };
    throughput: {
      commandsPerSecond: number;
      networksPerSecond: number;
    };
  }> {
    try {
      const redisInfo = await this.redisClient.getInfo();
      
      return {
        memory: {
          used: redisInfo.memory?.used_memory || 0,
          total: redisInfo.memory?.maxmemory || 0,
          fragmentation: redisInfo.memory?.mem_fragmentation_ratio || 1
        },
        cpu: {
          usage: redisInfo.cpu?.used_cpu_user || 0
        },
        connections: {
          active: redisInfo.clients?.connected_clients || 0,
          total: redisInfo.stats?.total_connections_received || 0
        },
        throughput: {
          commandsPerSecond: redisInfo.stats?.instantaneous_ops_per_sec || 0,
          networksPerSecond: redisInfo.stats?.instantaneous_input_kbps || 0
        }
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get system resources');
      throw error;
    }
  }

  /**
   * Generate monitoring report
   */
  async generateReport(hours: number = 24): Promise<{
    summary: {
      status: string;
      uptime: number;
      totalRequests: number;
      averageHitRate: number;
      errorCount: number;
    };
    metrics: CacheMetrics;
    alerts: {
      active: number;
      resolved: number;
      critical: number;
    };
    performance: {
      averageLatency: number;
      peakMemoryUsage: number;
      cacheThroughput: number;
    };
    recommendations: string[];
  }> {
    try {
      const currentHealth = await this.performHealthCheck();
      const currentMetrics = await this.getMetrics();
      const metricsHistory = this.getMetricsHistory(hours);
      const alertHistory = this.getAlertHistory(hours);
      
      // Calculate averages and peaks
      const averageHitRate = metricsHistory.length > 0 
        ? metricsHistory.reduce((sum, entry) => sum + entry.metrics.hitRate, 0) / metricsHistory.length
        : currentMetrics.hitRate;

      const peakMemoryUsage = metricsHistory.length > 0
        ? Math.max(...metricsHistory.map(entry => entry.metrics.memoryUsage))
        : currentMetrics.memoryUsage;

      const activeAlerts = alertHistory.filter(alert => alert.status === 'active').length;
      const resolvedAlerts = alertHistory.filter(alert => alert.status === 'resolved').length;
      const criticalAlerts = alertHistory.filter(
        alert => alert.rule.severity === 'critical' && alert.status === 'active'
      ).length;

      // Generate recommendations
      const recommendations: string[] = [];
      if (averageHitRate < 0.7) {
        recommendations.push('Consider increasing cache TTL for frequently accessed data');
      }
      if (currentHealth.redis.memoryUsage > 0.8) {
        recommendations.push('Monitor memory usage and consider increasing Redis memory limits');
      }
      if (currentHealth.redis.latency > 50) {
        recommendations.push('Investigate Redis latency issues - check network and CPU usage');
      }

      return {
        summary: {
          status: currentHealth.status,
          uptime: 0, // Would calculate from service start time
          totalRequests: currentMetrics.hits + currentMetrics.misses,
          averageHitRate,
          errorCount: currentMetrics.errors
        },
        metrics: currentMetrics,
        alerts: {
          active: activeAlerts,
          resolved: resolvedAlerts,
          critical: criticalAlerts
        },
        performance: {
          averageLatency: currentHealth.redis.latency,
          peakMemoryUsage,
          cacheThroughput: currentMetrics.commandsProcessed
        },
        recommendations
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate monitoring report');
      throw error;
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    this.stopHealthChecks();
    logger.info('Cache monitoring service cleaned up');
  }
}