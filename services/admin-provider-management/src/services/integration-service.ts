import { Logger } from '@caas/common';
import { 
  IntegrationServiceConfig, 
  CustomerServiceRequest,
  IntegrationServiceError 
} from '../types/admin-provider-management';
import { AdminProviderRepository } from '../repositories/admin-provider-repository';
import { NotificationService } from './notification-service';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export class IntegrationService {
  private logger: Logger;
  private adminProviderRepository: AdminProviderRepository;
  private notificationService: NotificationService;

  constructor(
    logger: Logger,
    adminProviderRepository: AdminProviderRepository,
    notificationService: NotificationService
  ) {
    this.logger = logger;
    this.adminProviderRepository = adminProviderRepository;
    this.notificationService = notificationService;
  }

  async initiateIntegrationProject(
    providerId: string,
    adminId: string
  ): Promise<{ projectId: string; estimatedCompletion: string }> {
    try {
      const integrationConfig = await this.adminProviderRepository.findIntegrationConfig(providerId);
      
      if (!integrationConfig) {
        throw new IntegrationServiceError(
          'Integration configuration not found',
          'INTEGRATION_CONFIG_NOT_FOUND',
          404
        );
      }

      // Create project in integration management system
      const projectId = uuidv4();
      
      // Update integration config with project ID and start date
      // Note: projectId and startDate are runtime extensions not in the base schema
      await this.adminProviderRepository.updateIntegrationConfig(providerId, {
        ...integrationConfig,
        status: 'in_progress',
        projectId,
        startDate: new Date().toISOString()
      } as IntegrationServiceConfig & { projectId: string; startDate: string });

      // Assign engineering team
      const assignedTeam = await this.assignIntegrationTeam(integrationConfig);
      
      // Create initial service requests for each milestone
      await this.createMilestoneServiceRequests(providerId, integrationConfig, assignedTeam);

      // Send project initiation notifications
      await this.notificationService.sendIntegrationProjectNotification({
        type: 'project_initiated',
        providerId,
        projectId,
        assignedTeam,
        estimatedCompletion: this.calculateEstimatedCompletion(integrationConfig.timeline.estimatedWeeks)
      });

      const estimatedCompletion = this.calculateEstimatedCompletion(integrationConfig.timeline.estimatedWeeks);

      this.logger.info('Integration project initiated', {
        providerId,
        projectId,
        estimatedCompletion,
        assignedTeam: assignedTeam.length
      });

      return { projectId, estimatedCompletion };
    } catch (error) {
      this.logger.error('Failed to initiate integration project', { error, providerId, adminId });
      throw error;
    }
  }

  async createCustomIntegration(
    providerId: string,
    integrationSpec: {
      endpointUrl: string;
      authMethod: 'api_key' | 'oauth' | 'jwt' | 'basic_auth';
      dataFormat: 'json' | 'xml' | 'csv';
      fieldMappings: Array<{ source: string; target: string; transformation?: string }>;
      webhookEndpoints: Array<{ event: string; url: string; method: string }>;
      testingRequirements: string[];
      customLogic?: string;
    },
    requestedBy: string
  ): Promise<{
    integrationId: string;
    testEndpoint: string;
    estimatedDelivery: string;
  }> {
    try {
      const integrationId = uuidv4();
      
      // Validate integration specifications
      await this.validateIntegrationSpec(integrationSpec);

      // Create custom integration configuration
      const customIntegration = {
        id: integrationId,
        providerId,
        specifications: integrationSpec,
        status: 'development' as const,
        createdBy: requestedBy,
        createdAt: new Date().toISOString(),
        testEndpoint: `${process.env.INTEGRATION_TEST_BASE_URL}/test/${integrationId}`,
        estimatedDelivery: this.calculateCustomIntegrationDelivery(integrationSpec)
      };

      await this.adminProviderRepository.createCustomIntegration(customIntegration);

      // Generate integration code scaffolding
      const scaffolding = await this.generateIntegrationScaffolding(integrationSpec);
      
      // Create development environment
      await this.setupDevelopmentEnvironment(integrationId, scaffolding);

      // Create service request for custom development
      const serviceRequestId = await this.createIntegrationServiceRequest(
        providerId,
        'custom_development',
        `Custom integration development for ${integrationSpec.endpointUrl}`,
        integrationSpec,
        requestedBy
      );

      // Send notifications to development team
      await this.notificationService.sendCustomIntegrationNotification({
        type: 'custom_integration_requested',
        integrationId,
        providerId,
        serviceRequestId,
        complexity: this.assessIntegrationComplexity(integrationSpec),
        estimatedDelivery: customIntegration.estimatedDelivery
      });

      this.logger.info('Custom integration created', {
        integrationId,
        providerId,
        endpointUrl: integrationSpec.endpointUrl,
        requestedBy
      });

      return {
        integrationId,
        testEndpoint: customIntegration.testEndpoint,
        estimatedDelivery: customIntegration.estimatedDelivery
      };
    } catch (error) {
      this.logger.error('Failed to create custom integration', { error, providerId, requestedBy });
      throw error;
    }
  }

  async setupProviderAPI(
    providerId: string,
    apiSpec: {
      baseUrl: string;
      endpoints: Array<{
        path: string;
        method: string;
        purpose: 'lead_submission' | 'status_update' | 'decision_callback' | 'webhook';
        requestSchema: any;
        responseSchema: any;
        authRequired: boolean;
      }>;
      authConfiguration: {
        type: 'api_key' | 'oauth' | 'jwt';
        keyLocation: 'header' | 'query' | 'body';
        keyName: string;
      };
      rateLimits: {
        requestsPerMinute: number;
        requestsPerHour: number;
        burstLimit: number;
      };
      errorHandling: {
        retryPolicy: {
          maxRetries: number;
          backoffStrategy: 'linear' | 'exponential';
          baseDelay: number;
        };
        timeoutMs: number;
      };
    },
    engineerId: string
  ): Promise<{
    apiUrl: string;
    apiKey: string;
    webhookSecret: string;
    testCredentials: any;
  }> {
    try {
      // Generate API credentials
      const apiKey = this.generateSecureAPIKey();
      const webhookSecret = this.generateWebhookSecret();
      
      // Create API configuration
      const apiConfig = {
        providerId,
        baseUrl: `${process.env.PROVIDER_API_BASE_URL}/providers/${providerId}`,
        endpoints: apiSpec.endpoints,
        authentication: {
          ...apiSpec.authConfiguration,
          apiKey,
          webhookSecret
        },
        rateLimits: apiSpec.rateLimits,
        errorHandling: apiSpec.errorHandling,
        status: 'active' as const,
        createdBy: engineerId,
        createdAt: new Date().toISOString()
      };

      // Deploy API configuration
      await this.deployProviderAPI(apiConfig);
      
      // Save configuration to database
      await this.adminProviderRepository.saveProviderAPIConfig(apiConfig);

      // Setup monitoring and alerting
      await this.setupAPIMonitoring(providerId, apiConfig);

      // Generate test credentials and environment
      const testCredentials = {
        testApiKey: this.generateTestAPIKey(apiKey),
        testWebhookUrl: `${apiConfig.baseUrl}/test/webhook`,
        sandboxEnvironment: true,
        testLeadData: this.generateTestLeadData()
      };

      // Send API setup completion notification
      await this.notificationService.sendAPISetupNotification({
        type: 'api_setup_completed',
        providerId,
        apiUrl: apiConfig.baseUrl,
        setupBy: engineerId
      });

      this.logger.info('Provider API setup completed', {
        providerId,
        apiUrl: apiConfig.baseUrl,
        setupBy: engineerId
      });

      return {
        apiUrl: apiConfig.baseUrl,
        apiKey,
        webhookSecret,
        testCredentials
      };
    } catch (error) {
      this.logger.error('Failed to setup provider API', { error, providerId, engineerId });
      throw error;
    }
  }

  async deployIntegrationUpdate(
    integrationId: string,
    updateSpec: {
      version: string;
      changes: Array<{
        type: 'endpoint_added' | 'endpoint_modified' | 'schema_updated' | 'auth_changed';
        description: string;
        details: any;
      }>;
      backwardCompatible: boolean;
      rollbackPlan: string;
    },
    deployedBy: string
  ): Promise<{
    deploymentId: string;
    deploymentUrl: string;
    rollbackUrl?: string;
  }> {
    try {
      const deploymentId = uuidv4();
      
      // Validate update specifications
      await this.validateUpdateSpec(integrationId, updateSpec);

      // Create deployment record
      const deployment = {
        id: deploymentId,
        integrationId,
        version: updateSpec.version,
        changes: updateSpec.changes,
        status: 'deploying' as const,
        deployedBy,
        deployedAt: new Date().toISOString(),
        backwardCompatible: updateSpec.backwardCompatible,
        rollbackPlan: updateSpec.rollbackPlan
      };

      await this.adminProviderRepository.createIntegrationDeployment(deployment);

      // Execute deployment
      const deploymentResult = await this.executeDeployment(deployment);

      // Update deployment status
      await this.adminProviderRepository.updateDeploymentStatus(
        deploymentId,
        deploymentResult.success ? 'completed' : 'failed',
        deploymentResult.details
      );

      if (!deploymentResult.success) {
        throw new IntegrationServiceError(
          `Deployment failed: ${deploymentResult.error}`,
          'DEPLOYMENT_FAILED',
          500
        );
      }

      // Setup rollback capability if needed
      let rollbackUrl;
      if (!updateSpec.backwardCompatible) {
        rollbackUrl = await this.setupRollbackCapability(integrationId, deploymentId);
      }

      // Send deployment notification
      await this.notificationService.sendDeploymentNotification({
        type: 'integration_deployed',
        integrationId,
        deploymentId,
        version: updateSpec.version,
        deployedBy
      });

      this.logger.info('Integration update deployed successfully', {
        integrationId,
        deploymentId,
        version: updateSpec.version,
        deployedBy
      });

      return {
        deploymentId,
        deploymentUrl: deploymentResult.deploymentUrl || '',
        rollbackUrl
      };
    } catch (error) {
      this.logger.error('Failed to deploy integration update', { error, integrationId, updateSpec });
      throw error;
    }
  }

  async monitorIntegrationHealth(
    providerId: string
  ): Promise<{
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    endpoints: Array<{
      endpoint: string;
      status: 'up' | 'down' | 'slow';
      responseTime: number;
      errorRate: number;
      lastChecked: string;
    }>;
    recommendations: string[];
  }> {
    try {
      const integrationConfig = await this.adminProviderRepository.findIntegrationConfig(providerId);
      
      if (!integrationConfig) {
        throw new IntegrationServiceError(
          'Integration configuration not found',
          'INTEGRATION_CONFIG_NOT_FOUND',
          404
        );
      }

      // Perform health checks on all endpoints
      // Note: endpoints is a runtime extension for provider API configs
      const configWithEndpoints = integrationConfig as IntegrationServiceConfig & { endpoints?: Array<{ url: string; path: string }> };
      const endpointHealth = await Promise.all(
        configWithEndpoints.endpoints?.map(async (endpoint) => {
          return await this.checkEndpointHealth(providerId, endpoint);
        }) || []
      );

      // Calculate overall health
      const overallHealth = this.calculateOverallHealth(endpointHealth);

      // Generate recommendations
      const recommendations = this.generateHealthRecommendations(endpointHealth);

      // Log health status
      this.logger.info('Integration health monitored', {
        providerId,
        overallHealth,
        endpointsChecked: endpointHealth.length
      });

      return {
        overallHealth,
        endpoints: endpointHealth,
        recommendations
      };
    } catch (error) {
      this.logger.error('Failed to monitor integration health', { error, providerId });
      throw error;
    }
  }

  private async assignIntegrationTeam(
    integrationConfig: IntegrationServiceConfig
  ): Promise<Array<{ id: string; role: string; expertise: string[] }>> {
    // Get available engineers based on service level and requirements
    const availableEngineers = await this.adminProviderRepository.getAvailableEngineers();
    
    const team = [];
    
    // Assign lead engineer
    const leadEngineer = availableEngineers.find(eng => 
      eng.role === 'senior' && 
      eng.expertise.includes('api_integration') &&
      eng.currentWorkload < 3
    );
    
    if (leadEngineer) {
      team.push({ ...leadEngineer, role: 'lead_engineer' });
    }

    // Assign additional engineers based on service level
    if (integrationConfig.serviceLevel === 'premium') {
      const supportEngineer = availableEngineers.find(eng => 
        eng.id !== leadEngineer?.id &&
        eng.expertise.includes('customer_service') &&
        eng.currentWorkload < 4
      );
      
      if (supportEngineer) {
        team.push({ ...supportEngineer, role: 'support_engineer' });
      }
    }

    return team;
  }

  private async createMilestoneServiceRequests(
    providerId: string,
    integrationConfig: IntegrationServiceConfig,
    assignedTeam: Array<{ id: string; role: string }>
  ): Promise<void> {
    for (const milestone of integrationConfig.timeline.milestones) {
      const serviceRequest: Omit<CustomerServiceRequest, 'id' | 'createdAt' | 'updatedAt'> = {
        providerId,
        requestType: this.mapMilestoneToRequestType(milestone.name),
        priority: 'medium',
        description: milestone.description,
        technicalDetails: {
          expectedVolume: 100, // Default for milestone
          customRequirements: `Milestone: ${milestone.name}`
        },
        timeline: {
          requestedCompletionDate: milestone.estimatedDate,
          estimatedHours: this.estimateHoursForMilestone(milestone.name)
        },
        status: 'open',
        assignedEngineer: assignedTeam[0]?.id,
        cost: {
          estimated: this.estimateCostForMilestone(milestone.name),
          billable: true
        },
        communication: []
      };

      await this.adminProviderRepository.createServiceRequest({
        id: uuidv4(),
        ...serviceRequest,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  private async validateIntegrationSpec(integrationSpec: any): Promise<void> {
    // Validate endpoint URL
    try {
      new URL(integrationSpec.endpointUrl);
    } catch {
      throw new IntegrationServiceError(
        'Invalid endpoint URL provided',
        'INVALID_ENDPOINT_URL',
        400
      );
    }

    // Validate field mappings
    if (!integrationSpec.fieldMappings || !Array.isArray(integrationSpec.fieldMappings)) {
      throw new IntegrationServiceError(
        'Field mappings are required and must be an array',
        'INVALID_FIELD_MAPPINGS',
        400
      );
    }

    // Test endpoint connectivity
    try {
      await axios.get(integrationSpec.endpointUrl, { timeout: 5000 });
    } catch {
      this.logger.warn('Endpoint connectivity test failed', { 
        endpointUrl: integrationSpec.endpointUrl 
      });
      // Don't throw error as endpoint might not be ready yet
    }
  }

  private async generateIntegrationScaffolding(integrationSpec: any): Promise<string> {
    // Generate basic integration code template
    const scaffolding = `
// Auto-generated integration scaffolding
export class ProviderIntegration {
  private baseUrl = '${integrationSpec.endpointUrl}';
  private authMethod = '${integrationSpec.authMethod}';
  
  async submitLead(leadData: any): Promise<any> {
    // Field mapping
    const mappedData = this.mapFields(leadData, ${JSON.stringify(integrationSpec.fieldMappings)});
    
    // Submit to provider endpoint
    const response = await this.makeRequest('POST', '/leads', mappedData);
    return response;
  }
  
  private mapFields(sourceData: any, mappings: any[]): any {
    const mapped = {};
    for (const mapping of mappings) {
      mapped[mapping.target] = sourceData[mapping.source];
    }
    return mapped;
  }
  
  private async makeRequest(method: string, path: string, data?: any): Promise<any> {
    // Implementation will be customized based on auth method and provider requirements
    // ${integrationSpec.customLogic || 'No custom logic specified'}
  }
}`;

    return scaffolding;
  }

  private async setupDevelopmentEnvironment(integrationId: string, scaffolding: string): Promise<void> {
    // In a real implementation, this would:
    // 1. Create a dedicated development environment
    // 2. Deploy the scaffolding code
    // 3. Setup testing infrastructure
    // 4. Configure CI/CD pipeline
    
    this.logger.info('Development environment setup initiated', { integrationId });
  }

  private async createIntegrationServiceRequest(
    providerId: string,
    requestType: any,
    description: string,
    technicalDetails: any,
    requestedBy: string
  ): Promise<string> {
    const serviceRequest: CustomerServiceRequest = {
      id: uuidv4(),
      providerId,
      requestType,
      priority: 'high',
      description,
      technicalDetails: {
        apiEndpoints: [technicalDetails.endpointUrl],
        dataFormat: technicalDetails.dataFormat,
        authMethod: technicalDetails.authMethod,
        customRequirements: technicalDetails.customLogic
      },
      timeline: {
        requestedCompletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
        estimatedHours: 40
      },
      status: 'open',
      cost: {
        estimated: 8000, // $8000 for custom integration
        billable: true
      },
      communication: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.adminProviderRepository.createServiceRequest(serviceRequest);
    return serviceRequest.id;
  }

  private assessIntegrationComplexity(integrationSpec: any): 'simple' | 'moderate' | 'complex' {
    let complexityScore = 0;
    
    // Factor in number of field mappings
    complexityScore += integrationSpec.fieldMappings.length * 0.5;
    
    // Factor in authentication method
    if (integrationSpec.authMethod === 'oauth') complexityScore += 3;
    else if (integrationSpec.authMethod === 'jwt') complexityScore += 2;
    else complexityScore += 1;
    
    // Factor in data format
    if (integrationSpec.dataFormat === 'xml') complexityScore += 2;
    else if (integrationSpec.dataFormat === 'csv') complexityScore += 1.5;
    
    // Factor in custom logic
    if (integrationSpec.customLogic) complexityScore += 5;
    
    // Factor in number of webhook endpoints
    complexityScore += integrationSpec.webhookEndpoints.length * 1.5;
    
    if (complexityScore <= 5) return 'simple';
    if (complexityScore <= 15) return 'moderate';
    return 'complex';
  }

  private calculateEstimatedCompletion(estimatedWeeks: number): string {
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + (estimatedWeeks * 7));
    return completionDate.toISOString();
  }

  private calculateCustomIntegrationDelivery(integrationSpec: any): string {
    const complexity = this.assessIntegrationComplexity(integrationSpec);
    let weeks = 2; // Base time
    
    switch (complexity) {
      case 'complex':
        weeks = 6;
        break;
      case 'moderate':
        weeks = 4;
        break;
      case 'simple':
        weeks = 2;
        break;
    }
    
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + (weeks * 7));
    return deliveryDate.toISOString();
  }

  private generateSecureAPIKey(): string {
    return 'caas_live_sk_' + Buffer.from(uuidv4() + Date.now()).toString('base64').substr(0, 32);
  }

  private generateWebhookSecret(): string {
    return 'whsec_' + Buffer.from(uuidv4()).toString('base64').substr(0, 32);
  }

  private generateTestAPIKey(apiKey: string): string {
    return apiKey.replace('live', 'test');
  }

  private generateTestLeadData(): any {
    return {
      leadId: 'test_lead_123',
      applicant: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phoneNumber: '+1-555-0123'
      },
      loanApplication: {
        requestedAmount: 25000,
        purpose: 'Business expansion',
        tenure: 365
      },
      creditScore: 720
    };
  }

  private async deployProviderAPI(apiConfig: any): Promise<void> {
    // Deploy API configuration to the provider API gateway
    this.logger.info('Deploying provider API configuration', { 
      providerId: apiConfig.providerId 
    });
  }

  private async setupAPIMonitoring(providerId: string, apiConfig: any): Promise<void> {
    // Setup monitoring, alerting, and health checks for the provider API
    this.logger.info('Setting up API monitoring', { providerId });
  }

  private async validateUpdateSpec(integrationId: string, updateSpec: any): Promise<void> {
    // Validate update specifications
    if (!updateSpec.version || !updateSpec.changes || !Array.isArray(updateSpec.changes)) {
      throw new IntegrationServiceError(
        'Invalid update specification',
        'INVALID_UPDATE_SPEC',
        400
      );
    }
  }

  private async executeDeployment(deployment: any): Promise<{ success: boolean; deploymentUrl?: string; error?: string; details?: any }> {
    try {
      // Execute the actual deployment
      const deploymentUrl = `${process.env.INTEGRATION_BASE_URL}/integrations/${deployment.integrationId}/v${deployment.version}`;
      
      // Simulate deployment process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        success: true,
        deploymentUrl,
        details: { deployedAt: new Date().toISOString() }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown deployment error'
      };
    }
  }

  private async setupRollbackCapability(integrationId: string, deploymentId: string): Promise<string> {
    const rollbackUrl = `${process.env.INTEGRATION_BASE_URL}/integrations/${integrationId}/rollback/${deploymentId}`;
    
    // Setup rollback capability
    this.logger.info('Setting up rollback capability', { integrationId, deploymentId });
    
    return rollbackUrl;
  }

  private async checkEndpointHealth(providerId: string, endpoint: any): Promise<{
    endpoint: string;
    status: 'up' | 'down' | 'slow';
    responseTime: number;
    errorRate: number;
    lastChecked: string;
  }> {
    const startTime = Date.now();
    let status: 'up' | 'down' | 'slow' = 'down';
    let responseTime = 0;

    try {
      await axios.get(endpoint.url, { timeout: 5000 });
      responseTime = Date.now() - startTime;
      status = responseTime > 2000 ? 'slow' : 'up';
    } catch {
      responseTime = Date.now() - startTime;
      status = 'down';
    }

    return {
      endpoint: endpoint.path,
      status,
      responseTime,
      errorRate: 0, // Would be calculated from monitoring data
      lastChecked: new Date().toISOString()
    };
  }

  private calculateOverallHealth(endpointHealth: Array<{ status: string }>): 'healthy' | 'degraded' | 'unhealthy' {
    const totalEndpoints = endpointHealth.length;
    const healthyEndpoints = endpointHealth.filter(ep => ep.status === 'up').length;
    const healthPercentage = (healthyEndpoints / totalEndpoints) * 100;

    if (healthPercentage >= 90) return 'healthy';
    if (healthPercentage >= 70) return 'degraded';
    return 'unhealthy';
  }

  private generateHealthRecommendations(endpointHealth: Array<{ status: string; responseTime: number }>): string[] {
    const recommendations = [];

    const slowEndpoints = endpointHealth.filter(ep => ep.responseTime > 2000);
    if (slowEndpoints.length > 0) {
      recommendations.push(`${slowEndpoints.length} endpoints are responding slowly. Consider optimization.`);
    }

    const downEndpoints = endpointHealth.filter(ep => ep.status === 'down');
    if (downEndpoints.length > 0) {
      recommendations.push(`${downEndpoints.length} endpoints are down. Immediate attention required.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('All endpoints are healthy. No action required.');
    }

    return recommendations;
  }

  private mapMilestoneToRequestType(milestoneName: string): any {
    const mapping: Record<string, any> = {
      'Requirements Analysis': 'api_integration',
      'API Development': 'custom_development',
      'Testing & Validation': 'testing_support',
      'Go Live': 'go_live_support'
    };

    return mapping[milestoneName] || 'api_integration';
  }

  private estimateHoursForMilestone(milestoneName: string): number {
    const estimates: Record<string, number> = {
      'Requirements Analysis': 16,
      'API Development': 80,
      'Testing & Validation': 32,
      'Go Live': 16
    };

    return estimates[milestoneName] || 20;
  }

  private estimateCostForMilestone(milestoneName: string): number {
    const estimates: Record<string, number> = {
      'Requirements Analysis': 2000,
      'API Development': 10000,
      'Testing & Validation': 4000,
      'Go Live': 2000
    };

    return estimates[milestoneName] || 2500;
  }
}