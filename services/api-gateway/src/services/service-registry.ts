import pino from 'pino';
import { ServiceConfig, ServiceInstance, ServiceHealth, LoadBalancerConfig } from '../types/gateway.js';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'service-registry' });
const env = validateEnv();

export class ServiceRegistry {
  private services: Map<string, ServiceConfig> = new Map();
  private instances: Map<string, ServiceInstance[]> = new Map();
  private health: Map<string, ServiceHealth> = new Map();
  private circuitBreakers: Map<string, any> = new Map();
  private loadBalancers: Map<string, LoadBalancerConfig> = new Map();

  constructor() {
    this.initializeServices();
    this.startHealthChecks();
  }

  /**
   * Initialize default services configuration
   */
  private initializeServices() {
    // Define core CaaS services
    const services: Record<string, ServiceConfig> = {
      'auth-service': {
        name: 'auth-service',
        version: '1.0.0',
        baseUrl: env.AUTH_SERVICE_URL || 'http://localhost:8001',
        healthCheckPath: '/auth/health',
        timeout: 30000,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          threshold: 5,
          timeout: 60000,
          resetTimeout: 30000
        },
        rateLimit: {
          enabled: true,
          max: 100,
          timeWindow: 60000
        },
        authentication: {
          required: false, // Auth service handles its own auth
          methods: ['jwt', 'api-key']
        }
      },
      'underwriting-service': {
        name: 'underwriting-service',
        version: '1.0.0',
        baseUrl: env.UNDERWRITING_SERVICE_URL || 'http://localhost:8002',
        healthCheckPath: '/underwriting/health',
        timeout: 45000,
        retries: 2,
        circuitBreaker: {
          enabled: true,
          threshold: 3,
          timeout: 30000,
          resetTimeout: 60000
        },
        rateLimit: {
          enabled: true,
          max: 50,
          timeWindow: 60000
        },
        authentication: {
          required: true,
          methods: ['jwt'],
          permissions: ['credit:assessment:create', 'credit:assessment:view']
        }
      },
      'disbursement-service': {
        name: 'disbursement-service',
        version: '1.0.0',
        baseUrl: env.DISBURSEMENT_SERVICE_URL || 'http://localhost:8003',
        healthCheckPath: '/disbursement/health',
        timeout: 60000,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          threshold: 3,
          timeout: 60000,
          resetTimeout: 120000
        },
        rateLimit: {
          enabled: true,
          max: 30,
          timeWindow: 60000
        },
        authentication: {
          required: true,
          methods: ['jwt'],
          permissions: ['credit:disbursement:execute']
        }
      },
      'repayment-service': {
        name: 'repayment-service',
        version: '1.0.0',
        baseUrl: env.REPAYMENT_SERVICE_URL || 'http://localhost:8004',
        healthCheckPath: '/repayment/health',
        timeout: 30000,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          threshold: 5,
          timeout: 30000,
          resetTimeout: 60000
        },
        rateLimit: {
          enabled: true,
          max: 100,
          timeWindow: 60000
        },
        authentication: {
          required: true,
          methods: ['jwt'],
          permissions: ['credit:repayment:process', 'credit:repayment:view']
        }
      },
      'notifications-service': {
        name: 'notifications-service',
        version: '1.0.0',
        baseUrl: env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:8007',
        healthCheckPath: '/notifications/health',
        timeout: 15000,
        retries: 2,
        circuitBreaker: {
          enabled: true,
          threshold: 10,
          timeout: 30000,
          resetTimeout: 30000
        },
        rateLimit: {
          enabled: true,
          max: 200,
          timeWindow: 60000
        },
        authentication: {
          required: true,
          methods: ['jwt', 'api-key']
        }
      },
      'blockchain-service': {
        name: 'blockchain-service',
        version: '1.0.0',
        baseUrl: env.BLOCKCHAIN_SERVICE_URL || 'http://localhost:8008',
        healthCheckPath: '/blockchain/health',
        timeout: 30000,
        retries: 2,
        circuitBreaker: {
          enabled: true,
          threshold: 3,
          timeout: 120000,
          resetTimeout: 300000
        },
        rateLimit: {
          enabled: true,
          max: 20,
          timeWindow: 60000
        },
        authentication: {
          required: true,
          methods: ['jwt'],
          permissions: ['credit:admin:all']
        }
      },
      'sme-integration': {
        name: 'sme-integration',
        version: '1.0.0',
        baseUrl: env.SME_API_BASE_URL || 'https://api.sme.seftechub.com',
        healthCheckPath: '/health',
        timeout: 30000,
        retries: 3,
        circuitBreaker: {
          enabled: true,
          threshold: 5,
          timeout: 60000,
          resetTimeout: 120000
        },
        rateLimit: {
          enabled: true,
          max: 1000,
          timeWindow: 60000
        },
        authentication: {
          required: true,
          methods: ['api-key']
        }
      }
    };

    // Register services
    for (const [name, config] of Object.entries(services)) {
      this.registerService(config);
    }

    logger.info({ serviceCount: this.services.size }, 'Services initialized');
  }

  /**
   * Register a new service
   */
  registerService(config: ServiceConfig): void {
    this.services.set(config.name, config);
    
    // Initialize service instances
    if (!this.instances.has(config.name)) {
      this.instances.set(config.name, [{
        id: `${config.name}-1`,
        url: config.baseUrl,
        healthy: false,
        connections: 0,
        metadata: { primary: true }
      }]);
    }

    // Initialize health status
    this.health.set(config.name, {
      service: config.name,
      status: 'unhealthy',
      responseTime: 0,
      errorRate: 0,
      lastCheck: new Date()
    });

    logger.info({ serviceName: config.name }, 'Service registered');
  }

  /**
   * Get service configuration
   */
  getService(name: string): ServiceConfig | undefined {
    return this.services.get(name);
  }

  /**
   * Get all services
   */
  getAllServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }

  /**
   * Get healthy service instance using load balancing
   */
  getServiceInstance(serviceName: string): ServiceInstance | null {
    const instances = this.instances.get(serviceName);
    if (!instances) return null;

    const healthyInstances = instances.filter(instance => instance.healthy);
    if (healthyInstances.length === 0) {
      // Fallback to any instance if none are healthy
      return instances[0] || null;
    }

    // Simple round-robin for now
    const selectedIndex = Math.floor(Math.random() * healthyInstances.length);
    return healthyInstances[selectedIndex];
  }

  /**
   * Add service instance for load balancing
   */
  addServiceInstance(serviceName: string, instance: ServiceInstance): void {
    const instances = this.instances.get(serviceName) || [];
    instances.push(instance);
    this.instances.set(serviceName, instances);
    
    logger.info({ serviceName, instanceId: instance.id }, 'Service instance added');
  }

  /**
   * Remove service instance
   */
  removeServiceInstance(serviceName: string, instanceId: string): void {
    const instances = this.instances.get(serviceName) || [];
    const filtered = instances.filter(instance => instance.id !== instanceId);
    this.instances.set(serviceName, filtered);
    
    logger.info({ serviceName, instanceId }, 'Service instance removed');
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.health.get(serviceName);
  }

  /**
   * Get all service health statuses
   */
  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Update service health
   */
  updateServiceHealth(serviceName: string, health: Partial<ServiceHealth>): void {
    const current = this.health.get(serviceName);
    if (current) {
      this.health.set(serviceName, { ...current, ...health, lastCheck: new Date() });
      
      // Update instance health
      const instances = this.instances.get(serviceName) || [];
      instances.forEach(instance => {
        instance.healthy = health.status === 'healthy';
        instance.lastHealthCheck = new Date();
      });
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    const checkInterval = 30000; // 30 seconds
    
    setInterval(async () => {
      await this.performHealthChecks();
    }, checkInterval);

    logger.info({ interval: checkInterval }, 'Health checks started');
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.services.values()).map(async (service) => {
      try {
        const startTime = Date.now();
        
        // Simple HTTP health check
        const response = await fetch(`${service.baseUrl}${service.healthCheckPath}`, {
          method: 'GET',
          headers: {
            'User-Agent': 'CaaS-Gateway-HealthCheck/1.0'
          }
        });

        const responseTime = Date.now() - startTime;
        const isHealthy = response.ok;

        this.updateServiceHealth(service.name, {
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime,
          errorRate: isHealthy ? 0 : 1
        });

        if (!isHealthy) {
          logger.warn({
            service: service.name,
            status: response.status,
            responseTime
          }, 'Service health check failed');
        }

      } catch (error) {
        this.updateServiceHealth(service.name, {
          status: 'unhealthy',
          responseTime: 0,
          errorRate: 1
        });

        logger.error({
          service: service.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Service health check error');
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Check if service is available (healthy and circuit breaker is closed)
   */
  isServiceAvailable(serviceName: string): boolean {
    const health = this.getServiceHealth(serviceName);
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    
    const isHealthy = health?.status === 'healthy';
    const circuitClosed = !circuitBreaker || circuitBreaker.state === 'CLOSED';
    
    return isHealthy && circuitClosed;
  }

  /**
   * Record service call result for circuit breaker
   */
  recordServiceCall(serviceName: string, success: boolean, responseTime: number): void {
    // Update response time metrics
    const health = this.getServiceHealth(serviceName);
    if (health) {
      // Simple moving average
      const newResponseTime = (health.responseTime + responseTime) / 2;
      this.updateServiceHealth(serviceName, { responseTime: newResponseTime });
    }

    // Circuit breaker logic would be implemented here
    // For now, just log the call
    logger.debug({
      service: serviceName,
      success,
      responseTime
    }, 'Service call recorded');
  }

  /**
   * Get service discovery information
   */
  getServiceDiscovery(): Record<string, any> {
    const discovery: Record<string, any> = {};
    
    for (const [name, config] of this.services.entries()) {
      const instances = this.instances.get(name) || [];
      const health = this.health.get(name);
      
      discovery[name] = {
        config,
        instances: instances.map(instance => ({
          id: instance.id,
          url: instance.url,
          healthy: instance.healthy,
          connections: instance.connections
        })),
        health: {
          status: health?.status || 'unknown',
          responseTime: health?.responseTime || 0,
          lastCheck: health?.lastCheck
        }
      };
    }
    
    return discovery;
  }
}