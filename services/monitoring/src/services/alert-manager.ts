import { Logger, MetricsCollector, Metric, AlertRule } from '@caas/common';
import { EventPublisher } from '@caas/common';

export interface Alert {
  id: string;
  ruleName: string;
  metricName: string;
  value: number;
  threshold?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  status: 'active' | 'resolved';
  resolvedAt?: number;
  duration?: number;
  labels?: Record<string, string>;
  actions?: string[];
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'slack' | 'sms' | 'event';
  config: Record<string, any>;
  conditions?: {
    severity?: string[];
    services?: string[];
    maxFrequency?: number; // minutes
  };
}

export interface AlertStats {
  activeAlerts: number;
  totalAlertsToday: number;
  alertsBySeverity: Record<string, number>;
  topAlertingServices: Array<{ service: string; count: number }>;
  averageResolutionTime: number;
  criticalAlertCount: number;
}

export class AlertManager {
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private eventPublisher: EventPublisher;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private alertActions: AlertAction[] = [];
  private maxAlertHistory = 1000;
  private alertCooldowns: Map<string, number> = new Map();

  constructor(metricsCollector: MetricsCollector, logger: Logger) {
    this.metricsCollector = metricsCollector;
    this.logger = logger;
    this.eventPublisher = new EventPublisher();
    this.setupDefaultRules();
    this.setupDefaultActions();
  }

  public addRule(rule: AlertRule): void {
    this.alertRules.set(rule.name, rule);
    this.logger.info(`Added alert rule: ${rule.name}`, { rule });
  }

  public removeRule(ruleName: string): void {
    this.alertRules.delete(ruleName);
    this.logger.info(`Removed alert rule: ${ruleName}`);
  }

  public updateRule(ruleName: string, updates: Partial<AlertRule>): void {
    const rule = this.alertRules.get(ruleName);
    if (rule) {
      Object.assign(rule, updates);
      this.logger.info(`Updated alert rule: ${ruleName}`, { updates });
    }
  }

  public addAction(action: AlertAction): void {
    this.alertActions.push(action);
    this.logger.info(`Added alert action: ${action.type}`, { action });
  }

  public evaluateRules(): void {
    const now = Date.now();
    const recentMetrics = this.metricsCollector.getMetrics(undefined, now - (5 * 60 * 1000)); // Last 5 minutes

    for (const metric of recentMetrics) {
      this.evaluateMetricAgainstRules(metric);
    }

    // Check for resolved alerts
    this.checkResolvedAlerts();
  }

  private evaluateMetricAgainstRules(metric: Metric): void {
    for (const [ruleName, rule] of this.alertRules.entries()) {
      if (!rule.enabled) continue;

      try {
        const shouldAlert = rule.condition(metric);
        
        if (shouldAlert) {
          this.triggerAlert(ruleName, rule, metric);
        }
      } catch (error) {
        this.logger.error(`Error evaluating rule '${ruleName}'`, error);
      }
    }
  }

  private triggerAlert(ruleName: string, rule: AlertRule, metric: Metric): void {
    const alertKey = `${ruleName}_${metric.name}`;
    
    // Check cooldown
    const lastAlert = this.alertCooldowns.get(alertKey);
    const cooldownPeriod = this.getCooldownPeriod(rule.severity);
    
    if (lastAlert && (Date.now() - lastAlert) < cooldownPeriod) {
      return; // Still in cooldown
    }

    // Check if alert is already active
    if (this.activeAlerts.has(alertKey)) {
      return; // Alert already active
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleName,
      metricName: metric.name,
      value: metric.value,
      threshold: rule.threshold,
      severity: rule.severity,
      message: this.generateAlertMessage(rule, metric),
      timestamp: Date.now(),
      status: 'active',
      labels: metric.labels,
      actions: this.getApplicableActions(rule.severity, metric),
    };

    this.activeAlerts.set(alertKey, alert);
    this.alertHistory.push(alert);
    this.alertCooldowns.set(alertKey, Date.now());

    // Trim history
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.splice(0, this.alertHistory.length - this.maxAlertHistory);
    }

    this.logger.warn(`Alert triggered: ${ruleName}`, alert);
    
    // Execute alert actions
    this.executeAlertActions(alert);
    
    // Publish system event
    this.publishAlertEvent(alert);
  }

  private checkResolvedAlerts(): void {
    for (const [alertKey, alert] of this.activeAlerts.entries()) {
      const rule = this.alertRules.get(alert.ruleName);
      if (!rule) continue;

      // Get recent metrics for this alert
      const recentMetrics = this.metricsCollector.getMetrics(alert.metricName, Date.now() - (2 * 60 * 1000)); // Last 2 minutes
      
      // Check if the condition is no longer met
      const stillTriggered = recentMetrics.some(metric => rule.condition(metric));
      
      if (!stillTriggered && recentMetrics.length > 0) {
        this.resolveAlert(alertKey, alert);
      }
    }
  }

  private resolveAlert(alertKey: string, alert: Alert): void {
    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.duration = alert.resolvedAt - alert.timestamp;

    this.activeAlerts.delete(alertKey);
    
    this.logger.info(`Alert resolved: ${alert.ruleName}`, {
      alertId: alert.id,
      duration: alert.duration,
    });

    // Publish resolution event
    this.publishAlertResolvedEvent(alert);
  }

  private generateAlertMessage(rule: AlertRule, metric: Metric): string {
    const { name, value, labels } = metric;
    const { threshold, operator } = rule;
    
    let message = `Alert: ${rule.name} - ${name} = ${value}`;
    
    if (threshold && operator) {
      const operatorText = {
        gt: 'above',
        gte: 'above or equal to',
        lt: 'below',
        lte: 'below or equal to',
        eq: 'equal to',
      }[operator] || 'compared to';
      
      message += ` (${operatorText} threshold of ${threshold})`;
    }
    
    if (labels && Object.keys(labels).length > 0) {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(', ');
      message += ` [${labelStr}]`;
    }
    
    return message;
  }

  private getCooldownPeriod(severity: string): number {
    switch (severity) {
      case 'critical':
        return 5 * 60 * 1000; // 5 minutes
      case 'high':
        return 10 * 60 * 1000; // 10 minutes
      case 'medium':
        return 15 * 60 * 1000; // 15 minutes
      case 'low':
        return 30 * 60 * 1000; // 30 minutes
      default:
        return 15 * 60 * 1000;
    }
  }

  private getApplicableActions(severity: string, metric: Metric): string[] {
    return this.alertActions
      .filter(action => {
        if (action.conditions?.severity && !action.conditions.severity.includes(severity)) {
          return false;
        }
        
        if (action.conditions?.services && metric.labels?.service) {
          return action.conditions.services.includes(metric.labels.service);
        }
        
        return true;
      })
      .map(action => action.type);
  }

  private async executeAlertActions(alert: Alert): Promise<void> {
    for (const action of this.alertActions) {
      if (!alert.actions?.includes(action.type)) continue;

      try {
        await this.executeAction(action, alert);
      } catch (error) {
        this.logger.error(`Failed to execute alert action '${action.type}'`, error, {
          alertId: alert.id,
          action: action.type,
        });
      }
    }
  }

  private async executeAction(action: AlertAction, alert: Alert): Promise<void> {
    switch (action.type) {
      case 'event':
        await this.eventPublisher.publishSystemAlert({
          message: alert.message,
          severity: alert.severity as any,
          component: 'monitoring',
          metrics: {
            alertId: alert.id,
            metricName: alert.metricName,
            value: alert.value,
            threshold: alert.threshold,
          },
        });
        break;

      case 'webhook':
        // Implement webhook notification
        if (action.config.url) {
          await this.sendWebhook(action.config.url, alert, action.config);
        }
        break;

      case 'email':
        // Implement email notification
        this.logger.info(`Email alert would be sent for: ${alert.ruleName}`, {
          to: action.config.recipients,
          subject: `Alert: ${alert.ruleName}`,
          alert,
        });
        break;

      case 'slack':
        // Implement Slack notification
        this.logger.info(`Slack alert would be sent for: ${alert.ruleName}`, {
          channel: action.config.channel,
          alert,
        });
        break;

      default:
        this.logger.warn(`Unknown alert action type: ${action.type}`);
    }
  }

  private async sendWebhook(url: string, alert: Alert, config: any): Promise<void> {
    try {
      const payload = {
        alert,
        timestamp: Date.now(),
        service: 'caas-monitoring',
        ...config.additionalData,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}: ${response.statusText}`);
      }

      this.logger.info(`Webhook alert sent successfully for: ${alert.ruleName}`, { url });
    } catch (error) {
      this.logger.error('Failed to send webhook alert', error);
      throw error;
    }
  }

  private async publishAlertEvent(alert: Alert): Promise<void> {
    try {
      await this.eventPublisher.publishSystemAlert({
        message: `Alert triggered: ${alert.message}`,
        severity: alert.severity as any,
        component: 'alert-manager',
        metrics: {
          alertId: alert.id,
          ruleName: alert.ruleName,
          metricName: alert.metricName,
          value: alert.value,
          threshold: alert.threshold,
        },
      });
    } catch (error) {
      this.logger.error('Failed to publish alert event', error);
    }
  }

  private async publishAlertResolvedEvent(alert: Alert): Promise<void> {
    try {
      await this.eventPublisher.publishSystemAlert({
        message: `Alert resolved: ${alert.message} (duration: ${alert.duration}ms)`,
        severity: 'low',
        component: 'alert-manager',
        metrics: {
          alertId: alert.id,
          ruleName: alert.ruleName,
          duration: alert.duration,
        },
      });
    } catch (error) {
      this.logger.error('Failed to publish alert resolved event', error);
    }
  }

  private setupDefaultRules(): void {
    // High memory usage
    this.addRule({
      name: 'high_memory_usage',
      condition: (metric) => metric.name === 'memory_usage_mb' && metric.value > 1024,
      threshold: 1024,
      operator: 'gt',
      severity: 'high',
      enabled: true,
    });

    // High response time
    this.addRule({
      name: 'high_response_time',
      condition: (metric) => metric.name.includes('response_time') && metric.value > 5000,
      threshold: 5000,
      operator: 'gt',
      severity: 'medium',
      enabled: true,
    });

    // High error rate
    this.addRule({
      name: 'high_error_rate',
      condition: (metric) => metric.name.includes('errors_per_minute') && metric.value > 10,
      threshold: 10,
      operator: 'gt',
      severity: 'critical',
      enabled: true,
    });

    // Service unavailable
    this.addRule({
      name: 'service_unavailable',
      condition: (metric) => metric.name.includes('health_check') && metric.value === 0,
      threshold: 0,
      operator: 'eq',
      severity: 'critical',
      enabled: true,
    });

    // High CPU usage
    this.addRule({
      name: 'high_cpu_usage',
      condition: (metric) => metric.name === 'cpu_usage_percent' && metric.value > 80,
      threshold: 80,
      operator: 'gt',
      severity: 'high',
      enabled: true,
    });
  }

  private setupDefaultActions(): void {
    // Event publishing action
    this.addAction({
      type: 'event',
      config: {},
      conditions: {
        severity: ['critical', 'high'],
      },
    });

    // Log action for all alerts
    this.addAction({
      type: 'webhook',
      config: {
        url: process.env.ALERT_WEBHOOK_URL || 'http://localhost:3009/api/v1/notifications/alerts',
        headers: {
          'Authorization': `Bearer ${process.env.ALERT_WEBHOOK_TOKEN || 'default-token'}`,
        },
      },
    });
  }

  // Public methods
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  public getAlertHistory(since?: number, severity?: string): Alert[] {
    let alerts = this.alertHistory;
    
    if (since) {
      alerts = alerts.filter(alert => alert.timestamp >= since);
    }
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getAlertStats(): AlertStats {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    const todayAlerts = this.alertHistory.filter(alert => alert.timestamp >= oneDayAgo);
    const resolvedAlerts = this.alertHistory.filter(alert => alert.status === 'resolved' && alert.duration);
    
    const alertsBySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    
    todayAlerts.forEach(alert => {
      alertsBySeverity[alert.severity]++;
    });
    
    const serviceAlerts = new Map<string, number>();
    todayAlerts.forEach(alert => {
      const service = alert.labels?.service || 'unknown';
      serviceAlerts.set(service, (serviceAlerts.get(service) || 0) + 1);
    });
    
    const topAlertingServices = Array.from(serviceAlerts.entries())
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const averageResolutionTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, alert) => sum + (alert.duration || 0), 0) / resolvedAlerts.length
      : 0;

    return {
      activeAlerts: this.activeAlerts.size,
      totalAlertsToday: todayAlerts.length,
      alertsBySeverity,
      topAlertingServices,
      averageResolutionTime,
      criticalAlertCount: alertsBySeverity.critical,
    };
  }

  public getRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  public getActions(): AlertAction[] {
    return [...this.alertActions];
  }

  public manuallyResolveAlert(alertId: string): boolean {
    for (const [key, alert] of this.activeAlerts.entries()) {
      if (alert.id === alertId) {
        this.resolveAlert(key, alert);
        return true;
      }
    }
    return false;
  }

  public silenceRule(ruleName: string, durationMs: number): void {
    const rule = this.alertRules.get(ruleName);
    if (rule) {
      rule.enabled = false;
      setTimeout(() => {
        rule.enabled = true;
        this.logger.info(`Alert rule '${ruleName}' un-silenced`);
      }, durationMs);
      
      this.logger.info(`Alert rule '${ruleName}' silenced for ${durationMs}ms`);
    }
  }
}