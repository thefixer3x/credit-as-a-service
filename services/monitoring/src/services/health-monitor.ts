import { Logger, HealthCheck } from '@caas/common';

export interface ServiceRegistration {
  name: string;
  url: string;
  healthEndpoint: string;
  checkInterval: number;
  timeout?: number;
  retries?: number;
  expectedStatus?: number;
  expectedResponse?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ServiceHealth extends HealthCheck {
  service: string;
  url: string;
  responseTime?: number;
  lastSuccessful?: number;
  consecutiveFailures: number;
  uptime: number; // percentage
  availability: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  services: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
  checks: HealthCheck[];
  lastUpdated: number;
}

export class HealthMonitor {
  private logger: Logger;
  private services: Map<string, ServiceRegistration> = new Map();
  private healthChecks: Map<string, ServiceHealth> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private healthHistory: Map<string, boolean[]> = new Map(); // For uptime calculation

  constructor(logger: Logger) {
    this.logger = logger;
    this.setupSystemHealthChecks();
  }

  public registerService(
    name: string,
    url: string,
    healthEndpoint: string,
    checkInterval: number = 30000,
    options: Partial<ServiceRegistration> = {}
  ): void {
    const service: ServiceRegistration = {
      name,
      url,
      healthEndpoint,
      checkInterval,
      timeout: options.timeout || 5000,
      retries: options.retries || 3,
      expectedStatus: options.expectedStatus || 200,
      expectedResponse: options.expectedResponse,
      tags: options.tags || [],
      metadata: options.metadata || {},
    };

    this.services.set(name, service);
    
    // Initialize health history
    if (!this.healthHistory.has(name)) {
      this.healthHistory.set(name, []);
    }

    // Start health checking
    this.startHealthCheck(service);
    
    this.logger.info(`Registered service for health monitoring: ${name}`, {
      url,
      healthEndpoint,
      checkInterval,
    });
  }

  public unregisterService(name: string): void {
    const interval = this.checkIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(name);
    }
    
    this.services.delete(name);
    this.healthChecks.delete(name);
    this.healthHistory.delete(name);
    
    this.logger.info(`Unregistered service from health monitoring: ${name}`);
  }

  private startHealthCheck(service: ServiceRegistration): void {
    // Clear existing interval
    const existingInterval = this.checkIntervals.get(service.name);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Perform initial check
    this.performHealthCheck(service);

    // Set up recurring checks
    const interval = setInterval(() => {
      this.performHealthCheck(service);
    }, service.checkInterval);

    this.checkIntervals.set(service.name, interval);
  }

  private async performHealthCheck(service: ServiceRegistration): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < (service.retries || 3)) {
      try {
        const health = await this.checkServiceHealth(service);
        const responseTime = Date.now() - startTime;

        health.responseTime = responseTime;
        health.timestamp = Date.now();
        
        this.updateHealthCheck(service.name, health, true);
        this.logger.debug(`Health check passed for ${service.name}`, {
          responseTime,
          status: health.status,
        });
        
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        attempt++;
        
        if (attempt < (service.retries || 3)) {
          await this.sleep(1000); // Wait 1 second before retry
        }
      }
    }

    // All retries failed
    const responseTime = Date.now() - startTime;
    const health: ServiceHealth = {
      service: service.name,
      name: service.name,
      url: service.url,
      status: 'unhealthy',
      message: lastError?.message || 'Health check failed',
      duration: responseTime,
      responseTime,
      timestamp: Date.now(),
      details: {
        error: lastError?.name,
        attempts: attempt,
        endpoint: `${service.url}${service.healthEndpoint}`,
      },
      consecutiveFailures: 0, // Will be updated in updateHealthCheck
      uptime: 0, // Will be calculated
      lastSuccessful: 0,
      availability: { last24h: 0, last7d: 0, last30d: 0 },
    };

    this.updateHealthCheck(service.name, health, false);
    this.logger.warn(`Health check failed for ${service.name}`, {
      error: lastError?.message,
      attempts: attempt,
      responseTime,
    });
  }

  private async checkServiceHealth(service: ServiceRegistration): Promise<ServiceHealth> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), service.timeout);

    try {
      const response = await fetch(`${service.url}${service.healthEndpoint}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'CAAS-HealthMonitor/1.0',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let status: ServiceHealth['status'] = 'healthy';
      let message = 'Service is healthy';
      let details: Record<string, any> = {};

      // Check status code
      if (response.status !== (service.expectedStatus || 200)) {
        status = 'unhealthy';
        message = `Unexpected status code: ${response.status}`;
      }

      // Check response body if expected
      if (service.expectedResponse && status === 'healthy') {
        const responseText = await response.text();
        if (!responseText.includes(service.expectedResponse)) {
          status = 'degraded';
          message = 'Response content mismatch';
          details.expectedResponse = service.expectedResponse;
          details.actualResponse = responseText.substring(0, 200);
        }
      }

      // Try to parse JSON response for additional health info
      try {
        const responseJson = await response.json();
        details = { ...details, ...responseJson };
        
        // Check if the service reports its own health status
        if (responseJson.status) {
          if (responseJson.status === 'unhealthy' || responseJson.status === 'down') {
            status = 'unhealthy';
            message = responseJson.message || 'Service reports unhealthy status';
          } else if (responseJson.status === 'degraded' || responseJson.status === 'warning') {
            status = 'degraded';
            message = responseJson.message || 'Service reports degraded status';
          }
        }
      } catch {
        // Response is not JSON, which is fine
      }

      return {
        service: service.name,
        name: service.name,
        url: service.url,
        status,
        message,
        timestamp: Date.now(),
        details,
        consecutiveFailures: 0,
        uptime: 0,
        lastSuccessful: 0,
        availability: { last24h: 0, last7d: 0, last30d: 0 },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private updateHealthCheck(serviceName: string, health: ServiceHealth, isHealthy: boolean): void {
    const existing = this.healthChecks.get(serviceName);
    
    // Update consecutive failures
    if (isHealthy) {
      health.consecutiveFailures = 0;
      health.lastSuccessful = Date.now();
    } else {
      health.consecutiveFailures = (existing?.consecutiveFailures || 0) + 1;
      health.lastSuccessful = existing?.lastSuccessful || 0;
    }

    // Update health history for uptime calculation
    const history = this.healthHistory.get(serviceName) || [];
    history.push(isHealthy);
    
    // Keep only recent history (e.g., last 24 hours of 30-second checks = 2880 entries)
    const maxHistory = 2880; // 24 hours with 30-second intervals
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }
    
    this.healthHistory.set(serviceName, history);

    // Calculate uptime and availability
    health.uptime = this.calculateUptime(history);
    health.availability = this.calculateAvailability(history);

    this.healthChecks.set(serviceName, health);
  }

  private calculateUptime(history: boolean[]): number {
    if (history.length === 0) return 100;
    
    const healthyCount = history.filter(h => h).length;
    return (healthyCount / history.length) * 100;
  }

  private calculateAvailability(history: boolean[]): ServiceHealth['availability'] {
    const intervals = {
      last24h: 2880,   // 24 hours * 60 minutes * 2 (30-second intervals)
      last7d: 20160,   // 7 days * 24 hours * 60 minutes * 2
      last30d: 86400,  // 30 days * 24 hours * 60 minutes * 2
    };

    const result = { last24h: 100, last7d: 100, last30d: 100 };

    for (const [period, maxEntries] of Object.entries(intervals)) {
      const relevantHistory = history.slice(-maxEntries);
      if (relevantHistory.length > 0) {
        const healthyCount = relevantHistory.filter(h => h).length;
        result[period as keyof typeof result] = (healthyCount / relevantHistory.length) * 100;
      }
    }

    return result;
  }

  private setupSystemHealthChecks(): void {
    // Add system-level health checks
    setInterval(() => {
      this.checkSystemResources();
    }, 30000); // Check every 30 seconds
  }

  private checkSystemResources(): void {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Memory check
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    const memStatus = memUsageMB > 2048 ? 'unhealthy' : memUsageMB > 1024 ? 'degraded' : 'healthy';
    
    this.healthChecks.set('system_memory', {
      service: 'system',
      name: 'system_memory',
      url: 'internal',
      status: memStatus,
      message: `Memory usage: ${memUsageMB.toFixed(2)} MB`,
      timestamp: Date.now(),
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      consecutiveFailures: 0,
      uptime: 100,
      lastSuccessful: Date.now(),
      availability: { last24h: 100, last7d: 100, last30d: 100 },
    });

    // Process uptime check
    const uptimeStatus = uptime > 0 ? 'healthy' : 'unhealthy';
    
    this.healthChecks.set('system_uptime', {
      service: 'system',
      name: 'system_uptime',
      url: 'internal',
      status: uptimeStatus,
      message: `Process uptime: ${Math.floor(uptime / 60)} minutes`,
      timestamp: Date.now(),
      details: {
        uptimeSeconds: uptime,
        uptimeMinutes: Math.floor(uptime / 60),
        uptimeHours: Math.floor(uptime / 3600),
      },
      consecutiveFailures: 0,
      uptime: 100,
      lastSuccessful: Date.now(),
      availability: { last24h: 100, last7d: 100, last30d: 100 },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods
  public getHealthChecks(): ServiceHealth[] {
    return Array.from(this.healthChecks.values());
  }

  public getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.healthChecks.get(serviceName);
  }

  public getOverallHealth(): SystemHealth {
    const services = this.getHealthChecks();
    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    let overallStatus: SystemHealth['status'] = 'healthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      services,
      summary: {
        total: services.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        degraded: degradedCount,
      },
      checks: services,
      lastUpdated: Date.now(),
    };
  }

  public getRegisteredServices(): ServiceRegistration[] {
    return Array.from(this.services.values());
  }

  public getServicesByTag(tag: string): ServiceHealth[] {
    const taggedServices = Array.from(this.services.values())
      .filter(service => service.tags?.includes(tag))
      .map(service => service.name);

    return this.getHealthChecks().filter(health => taggedServices.includes(health.service));
  }

  public getUnhealthyServices(): ServiceHealth[] {
    return this.getHealthChecks().filter(health => health.status === 'unhealthy');
  }

  public getDegradedServices(): ServiceHealth[] {
    return this.getHealthChecks().filter(health => health.status === 'degraded');
  }

  public getServiceStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    degradedServices: number;
    averageResponseTime: number;
    averageUptime: number;
    servicesWithIssues: ServiceHealth[];
  } {
    const services = this.getHealthChecks();
    const responseTimes = services
      .filter(s => s.responseTime !== undefined)
      .map(s => s.responseTime!);

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const averageUptime = services.length > 0
      ? services.reduce((sum, service) => sum + service.uptime, 0) / services.length
      : 100;

    const servicesWithIssues = services.filter(s => 
      s.status !== 'healthy' || s.consecutiveFailures > 0 || s.uptime < 99
    );

    return {
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      unhealthyServices: services.filter(s => s.status === 'unhealthy').length,
      degradedServices: services.filter(s => s.status === 'degraded').length,
      averageResponseTime,
      averageUptime,
      servicesWithIssues,
    };
  }

  public async performManualCheck(serviceName: string): Promise<ServiceHealth | null> {
    const service = this.services.get(serviceName);
    if (!service) {
      return null;
    }

    await this.performHealthCheck(service);
    return this.healthChecks.get(serviceName) || null;
  }

  public updateServiceConfig(serviceName: string, updates: Partial<ServiceRegistration>): boolean {
    const service = this.services.get(serviceName);
    if (!service) {
      return false;
    }

    Object.assign(service, updates);
    
    // Restart health checking if interval changed
    if (updates.checkInterval) {
      this.startHealthCheck(service);
    }

    this.logger.info(`Updated service config for ${serviceName}`, updates);
    return true;
  }
}