import { Logger } from '@caas/common';
import {
  AdminProviderOnboarding,
  IntegrationServiceConfig,
  MarginConfiguration,
  CustomerServiceRequest,
  ProviderPerformance,
  AdminActionLog
} from '../types/admin-provider-management';

/**
 * Engineer type for workload assignment
 */
export interface Engineer {
  id: string;
  name: string;
  role: 'junior' | 'mid' | 'senior';
  expertise: string[];
  currentWorkload: number;
  maxWorkload: number;
}

/**
 * Provider onboarding record with status tracking
 */
export interface ProviderOnboardingRecord extends AdminProviderOnboarding {
  id: string;
  providerId: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvalNotes?: string;
  rejectionReason?: string;
}

/**
 * Custom integration record
 */
export interface CustomIntegration {
  id: string;
  providerId: string;
  specifications: {
    endpointUrl: string;
    authMethod: string;
    dataFormat: string;
    fieldMappings: Array<{ source: string; target: string; transformation?: string }>;
    webhookEndpoints: Array<{ event: string; url: string; method: string }>;
    testingRequirements: string[];
    customLogic?: string;
  };
  status: 'development' | 'testing' | 'deployed' | 'deprecated';
  createdBy: string;
  createdAt: string;
  testEndpoint: string;
  estimatedDelivery: string;
}

/**
 * Integration deployment record
 */
export interface IntegrationDeployment {
  id: string;
  integrationId: string;
  version: string;
  changes: Array<{
    type: string;
    description: string;
    details: unknown;
  }>;
  status: 'deploying' | 'completed' | 'failed' | 'rolled_back';
  deployedBy: string;
  deployedAt: string;
  backwardCompatible: boolean;
  rollbackPlan: string;
  details?: unknown;
}

/**
 * Provider API configuration
 */
export interface ProviderAPIConfig {
  providerId: string;
  baseUrl: string;
  endpoints: Array<{
    path: string;
    method: string;
    purpose: string;
    requestSchema: unknown;
    responseSchema: unknown;
    authRequired: boolean;
  }>;
  authentication: {
    type: string;
    keyLocation: string;
    keyName: string;
    apiKey: string;
    webhookSecret: string;
  };
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    burstLimit: number;
  };
  errorHandling: {
    retryPolicy: {
      maxRetries: number;
      backoffStrategy: string;
      baseDelay: number;
    };
    timeoutMs: number;
  };
  status: 'active' | 'inactive' | 'suspended';
  createdBy: string;
  createdAt: string;
}

/**
 * Repository for admin provider management data operations.
 *
 * Note: This is a base implementation using in-memory storage.
 * In production, this should be replaced with actual database operations
 * (e.g., PostgreSQL via Supabase, or another persistence layer).
 */
export class AdminProviderRepository {
  private logger: Logger;

  // In-memory storage (replace with database in production)
  private providers: Map<string, ProviderOnboardingRecord> = new Map();
  private onboardings: Map<string, ProviderOnboardingRecord> = new Map();
  private integrationConfigs: Map<string, IntegrationServiceConfig> = new Map();
  private marginConfigs: Map<string, MarginConfiguration & { active?: boolean }> = new Map();
  private serviceRequests: Map<string, CustomerServiceRequest> = new Map();
  private adminActionLogs: AdminActionLog[] = [];
  private engineers: Engineer[] = [];
  private customIntegrations: Map<string, CustomIntegration> = new Map();
  private deployments: Map<string, IntegrationDeployment> = new Map();
  private providerAPIConfigs: Map<string, ProviderAPIConfig> = new Map();
  private performanceCache: Map<string, ProviderPerformance> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeMockData();
  }

  /**
   * Initialize with mock data for development/testing
   */
  private initializeMockData(): void {
    // Add mock engineers
    this.engineers = [
      {
        id: 'eng-001',
        name: 'Alice Johnson',
        role: 'senior',
        expertise: ['api_integration', 'customer_service', 'custom_development'],
        currentWorkload: 2,
        maxWorkload: 5
      },
      {
        id: 'eng-002',
        name: 'Bob Smith',
        role: 'mid',
        expertise: ['api_integration', 'webhook_setup', 'testing_support'],
        currentWorkload: 3,
        maxWorkload: 5
      },
      {
        id: 'eng-003',
        name: 'Carol Williams',
        role: 'junior',
        expertise: ['data_mapping', 'testing_support', 'go_live_support'],
        currentWorkload: 1,
        maxWorkload: 4
      }
    ];
  }

  // ==================== Provider Operations ====================

  /**
   * Find provider by email address
   */
  async findByEmail(email: string): Promise<ProviderOnboardingRecord | null> {
    this.logger.debug('Finding provider by email', { email });

    for (const provider of this.providers.values()) {
      if (provider.businessEmail === email) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Find provider by ID
   */
  async findProviderById(providerId: string): Promise<ProviderOnboardingRecord | null> {
    this.logger.debug('Finding provider by ID', { providerId });
    return this.providers.get(providerId) || null;
  }

  /**
   * Create a new provider onboarding record
   */
  async createProviderOnboarding(onboarding: ProviderOnboardingRecord): Promise<void> {
    this.logger.info('Creating provider onboarding', {
      onboardingId: onboarding.id,
      providerId: onboarding.providerId
    });

    this.onboardings.set(onboarding.id, onboarding);
    this.providers.set(onboarding.providerId, onboarding);
  }

  // ==================== Onboarding Operations ====================

  /**
   * Find onboarding record by ID
   */
  async findOnboardingById(onboardingId: string): Promise<ProviderOnboardingRecord | null> {
    this.logger.debug('Finding onboarding by ID', { onboardingId });
    return this.onboardings.get(onboardingId) || null;
  }

  /**
   * Update onboarding status
   */
  async updateOnboardingStatus(
    onboardingId: string,
    status: 'pending_review' | 'approved' | 'rejected' | 'suspended',
    notes?: string
  ): Promise<void> {
    this.logger.info('Updating onboarding status', { onboardingId, status });

    const onboarding = this.onboardings.get(onboardingId);
    if (onboarding) {
      onboarding.status = status;
      onboarding.updatedAt = new Date();

      if (status === 'approved') {
        onboarding.approvalNotes = notes;
      } else if (status === 'rejected') {
        onboarding.rejectionReason = notes;
      }

      this.onboardings.set(onboardingId, onboarding);

      // Update provider record as well
      if (this.providers.has(onboarding.providerId)) {
        this.providers.set(onboarding.providerId, onboarding);
      }
    }
  }

  /**
   * Find onboardings with filters
   */
  async findOnboardings(filters: {
    status?: string;
    priority?: string;
    assignedAdmin?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    onboardings: ProviderOnboardingRecord[];
    total: number;
    offset: number;
  }> {
    this.logger.debug('Finding onboardings with filters', { filters });

    let results = Array.from(this.onboardings.values());

    if (filters.status) {
      results = results.filter(o => o.status === filters.status);
    }
    if (filters.priority) {
      results = results.filter(o => o.priority === filters.priority);
    }
    if (filters.assignedAdmin) {
      results = results.filter(o => o.assignedAdmin === filters.assignedAdmin);
    }

    const total = results.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;

    results = results.slice(offset, offset + limit);

    return { onboardings: results, total, offset };
  }

  // ==================== Integration Config Operations ====================

  /**
   * Create integration configuration
   */
  async createIntegrationConfig(config: IntegrationServiceConfig): Promise<void> {
    this.logger.info('Creating integration config', { providerId: config.providerId });
    this.integrationConfigs.set(config.providerId, config);
  }

  /**
   * Find integration configuration by provider ID
   */
  async findIntegrationConfig(providerId: string): Promise<IntegrationServiceConfig | null> {
    this.logger.debug('Finding integration config', { providerId });
    return this.integrationConfigs.get(providerId) || null;
  }

  /**
   * Update integration configuration
   */
  async updateIntegrationConfig(
    providerId: string,
    config: IntegrationServiceConfig
  ): Promise<void> {
    this.logger.info('Updating integration config', { providerId });
    this.integrationConfigs.set(providerId, config);
  }

  // ==================== Margin Config Operations ====================

  /**
   * Create margin configuration
   */
  async createMarginConfig(config: MarginConfiguration): Promise<void> {
    this.logger.info('Creating margin config', { providerId: config.providerId });
    this.marginConfigs.set(config.providerId, { ...config, active: false });
  }

  /**
   * Find margin configuration by provider ID
   */
  async findMarginConfig(providerId: string): Promise<MarginConfiguration | null> {
    this.logger.debug('Finding margin config', { providerId });
    return this.marginConfigs.get(providerId) || null;
  }

  /**
   * Update margin configuration
   */
  async updateMarginConfiguration(
    providerId: string,
    config: MarginConfiguration
  ): Promise<void> {
    this.logger.info('Updating margin config', { providerId });
    const existing = this.marginConfigs.get(providerId);
    this.marginConfigs.set(providerId, { ...config, active: existing?.active ?? false });
  }

  /**
   * Activate margin configuration for a provider
   */
  async activateMarginConfiguration(providerId: string): Promise<void> {
    this.logger.info('Activating margin config', { providerId });
    const config = this.marginConfigs.get(providerId);
    if (config) {
      config.active = true;
      this.marginConfigs.set(providerId, config);
    }
  }

  // ==================== Service Request Operations ====================

  /**
   * Create a service request
   */
  async createServiceRequest(request: CustomerServiceRequest): Promise<void> {
    this.logger.info('Creating service request', {
      requestId: request.id,
      providerId: request.providerId
    });
    this.serviceRequests.set(request.id, request);
  }

  /**
   * Find service requests by provider ID
   */
  async findServiceRequests(providerId: string): Promise<CustomerServiceRequest[]> {
    this.logger.debug('Finding service requests', { providerId });
    return Array.from(this.serviceRequests.values())
      .filter(r => r.providerId === providerId);
  }

  /**
   * Update service request assignment
   */
  async updateServiceRequestAssignment(
    requestId: string,
    assignedEngineer: string
  ): Promise<void> {
    this.logger.info('Updating service request assignment', { requestId, assignedEngineer });
    const request = this.serviceRequests.get(requestId);
    if (request) {
      request.assignedEngineer = assignedEngineer;
      request.updatedAt = new Date().toISOString();
      this.serviceRequests.set(requestId, request);
    }
  }

  // ==================== Admin Action Logs ====================

  /**
   * Log an admin action
   */
  async logAdminAction(action: AdminActionLog): Promise<void> {
    this.logger.info('Logging admin action', {
      actionId: action.id,
      adminId: action.adminId,
      action: action.action
    });
    this.adminActionLogs.push(action);
  }

  /**
   * Get admin action logs for a provider
   */
  async getAdminActionLogs(providerId: string, limit = 50): Promise<AdminActionLog[]> {
    return this.adminActionLogs
      .filter(log => log.providerId === providerId)
      .slice(-limit)
      .reverse();
  }

  // ==================== Engineer Operations ====================

  /**
   * Get available engineers for assignment
   */
  async getAvailableEngineers(): Promise<Engineer[]> {
    this.logger.debug('Getting available engineers');
    return this.engineers.filter(e => e.currentWorkload < e.maxWorkload);
  }

  /**
   * Update engineer workload
   */
  async updateEngineerWorkload(engineerId: string, delta: number): Promise<void> {
    const engineer = this.engineers.find(e => e.id === engineerId);
    if (engineer) {
      engineer.currentWorkload = Math.max(0, engineer.currentWorkload + delta);
    }
  }

  // ==================== Performance Operations ====================

  /**
   * Get provider performance metrics
   */
  async getProviderPerformance(providerId: string): Promise<ProviderPerformance | null> {
    this.logger.debug('Getting provider performance', { providerId });

    // Return cached or generate mock performance data
    if (this.performanceCache.has(providerId)) {
      return this.performanceCache.get(providerId)!;
    }

    // Generate mock performance for development
    const mockPerformance: ProviderPerformance = {
      providerId,
      period: {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      },
      metrics: {
        totalLeadsReceived: 150,
        totalLeadsProcessed: 145,
        totalLeadsApproved: 87,
        totalLeadsRejected: 58,
        totalAmountDisbursed: 1250000,
        averageResponseTime: 4.5,
        averageLoanAmount: 14368,
        conversionRate: 60,
        approvalRate: 60,
        customerSatisfactionScore: 4.2
      },
      revenue: {
        totalRevenue: 62500,
        marginRevenue: 50000,
        serviceRevenue: 12500,
        averageRevenuePerLead: 718,
        projectedMonthlyRevenue: 75000
      },
      ranking: {
        overallRank: 5,
        categoryRank: 3,
        performanceScore: 78,
        trendDirection: 'up'
      }
    };

    this.performanceCache.set(providerId, mockPerformance);
    return mockPerformance;
  }

  // ==================== Custom Integration Operations ====================

  /**
   * Create a custom integration record
   */
  async createCustomIntegration(integration: CustomIntegration): Promise<void> {
    this.logger.info('Creating custom integration', {
      integrationId: integration.id,
      providerId: integration.providerId
    });
    this.customIntegrations.set(integration.id, integration);
  }

  /**
   * Find custom integration by ID
   */
  async findCustomIntegration(integrationId: string): Promise<CustomIntegration | null> {
    return this.customIntegrations.get(integrationId) || null;
  }

  // ==================== Provider API Config Operations ====================

  /**
   * Save provider API configuration
   */
  async saveProviderAPIConfig(config: ProviderAPIConfig): Promise<void> {
    this.logger.info('Saving provider API config', { providerId: config.providerId });
    this.providerAPIConfigs.set(config.providerId, config);
  }

  /**
   * Find provider API configuration
   */
  async findProviderAPIConfig(providerId: string): Promise<ProviderAPIConfig | null> {
    return this.providerAPIConfigs.get(providerId) || null;
  }

  // ==================== Deployment Operations ====================

  /**
   * Create an integration deployment record
   */
  async createIntegrationDeployment(deployment: IntegrationDeployment): Promise<void> {
    this.logger.info('Creating integration deployment', {
      deploymentId: deployment.id,
      integrationId: deployment.integrationId
    });
    this.deployments.set(deployment.id, deployment);
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: 'deploying' | 'completed' | 'failed' | 'rolled_back',
    details?: unknown
  ): Promise<void> {
    this.logger.info('Updating deployment status', { deploymentId, status });
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.status = status;
      deployment.details = details;
      this.deployments.set(deploymentId, deployment);
    }
  }

  /**
   * Find deployment by ID
   */
  async findDeployment(deploymentId: string): Promise<IntegrationDeployment | null> {
    return this.deployments.get(deploymentId) || null;
  }

  /**
   * Get deployments for an integration
   */
  async getDeploymentsForIntegration(integrationId: string): Promise<IntegrationDeployment[]> {
    return Array.from(this.deployments.values())
      .filter(d => d.integrationId === integrationId)
      .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime());
  }
}
