import { Logger } from '@caas/common';
import { 
  AdminProviderOnboarding, 
  IntegrationServiceConfig,
  MarginConfiguration,
  CustomerServiceRequest,
  AdminProviderManagementError 
} from '../types/admin-provider-management';
import { AdminProviderRepository } from '../repositories/admin-provider-repository';
import { NotificationService } from './notification-service';
import { IntegrationService } from './integration-service';
import { MarginCalculationService } from './margin-calculation-service';
import { v4 as uuidv4 } from 'uuid';

export class AdminProviderOnboardingService {
  private logger: Logger;
  private adminProviderRepository: AdminProviderRepository;
  private notificationService: NotificationService;
  private integrationService: IntegrationService;
  private marginCalculationService: MarginCalculationService;

  constructor(
    logger: Logger,
    adminProviderRepository: AdminProviderRepository,
    notificationService: NotificationService,
    integrationService: IntegrationService,
    marginCalculationService: MarginCalculationService
  ) {
    this.logger = logger;
    this.adminProviderRepository = adminProviderRepository;
    this.notificationService = notificationService;
    this.integrationService = integrationService;
    this.marginCalculationService = marginCalculationService;
  }

  async createProviderOnboarding(
    onboardingData: AdminProviderOnboarding,
    adminId: string
  ): Promise<{ providerId: string; onboardingId: string }> {
    try {
      // Validate business email uniqueness
      const existingProvider = await this.adminProviderRepository.findByEmail(
        onboardingData.businessEmail
      );

      if (existingProvider) {
        throw new AdminProviderManagementError(
          'Provider with this email already exists',
          'PROVIDER_EMAIL_EXISTS',
          400
        );
      }

      // Generate provider ID
      const providerId = uuidv4();
      const onboardingId = uuidv4();

      // Create provider onboarding record
      const providerOnboarding = {
        id: onboardingId,
        providerId,
        ...onboardingData,
        status: 'pending_review' as const,
        createdBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.adminProviderRepository.createProviderOnboarding(providerOnboarding);

      // Create integration service configuration if needed
      if (onboardingData.integrationService.needsTechnicalSupport) {
        await this.createIntegrationServiceConfig(providerId, onboardingData, adminId);
      }

      // Create initial margin configuration
      await this.createInitialMarginConfiguration(providerId, onboardingData, adminId);

      // Log admin action
      await this.adminProviderRepository.logAdminAction({
        id: uuidv4(),
        adminId,
        providerId,
        action: 'provider_created',
        details: {
          description: `Created provider onboarding for ${onboardingData.companyName}`,
          newValue: { providerId, onboardingId }
        },
        timestamp: new Date().toISOString()
      });

      // Send notification to assigned admin
      await this.notificationService.sendProviderOnboardingNotification({
        type: 'new_provider_onboarding',
        providerId,
        providerName: onboardingData.companyName,
        assignedAdmin: onboardingData.assignedAdmin,
        priority: onboardingData.priority
      });

      this.logger.info('Provider onboarding created successfully', {
        providerId,
        onboardingId,
        companyName: onboardingData.companyName,
        createdBy: adminId
      });

      return { providerId, onboardingId };
    } catch (error) {
      this.logger.error('Failed to create provider onboarding', { error, adminId });
      throw error;
    }
  }

  async approveProviderOnboarding(
    onboardingId: string,
    adminId: string,
    approvalNotes?: string
  ): Promise<void> {
    try {
      const onboarding = await this.adminProviderRepository.findOnboardingById(onboardingId);
      
      if (!onboarding) {
        throw new AdminProviderManagementError(
          'Onboarding record not found',
          'ONBOARDING_NOT_FOUND',
          404
        );
      }

      if (onboarding.status !== 'pending_review') {
        throw new AdminProviderManagementError(
          'Only pending onboarding records can be approved',
          'INVALID_ONBOARDING_STATUS',
          400
        );
      }

      // Update onboarding status
      await this.adminProviderRepository.updateOnboardingStatus(
        onboardingId,
        'approved',
        approvalNotes
      );

      // Create actual provider record in main system
      const providerId = await this.createProviderInMainSystem(onboarding);

      // Initialize integration service if required
      if (onboarding.integrationService.needsTechnicalSupport) {
        await this.integrationService.initiateIntegrationProject(providerId, adminId);
      }

      // Activate margin configuration
      await this.marginCalculationService.activateMarginConfiguration(providerId);

      // Log admin action
      await this.adminProviderRepository.logAdminAction({
        id: uuidv4(),
        adminId,
        providerId: onboarding.providerId,
        action: 'provider_approved',
        details: {
          description: `Approved provider onboarding for ${onboarding.companyName}`,
          reason: approvalNotes
        },
        timestamp: new Date().toISOString()
      });

      // Send approval notification
      await this.notificationService.sendProviderApprovalNotification({
        type: 'provider_approved',
        providerId: onboarding.providerId,
        providerName: onboarding.companyName,
        providerEmail: onboarding.businessEmail,
        approvedBy: adminId
      });

      this.logger.info('Provider onboarding approved successfully', {
        onboardingId,
        providerId: onboarding.providerId,
        approvedBy: adminId
      });
    } catch (error) {
      this.logger.error('Failed to approve provider onboarding', { error, onboardingId, adminId });
      throw error;
    }
  }

  async rejectProviderOnboarding(
    onboardingId: string,
    adminId: string,
    rejectionReason: string
  ): Promise<void> {
    try {
      const onboarding = await this.adminProviderRepository.findOnboardingById(onboardingId);
      
      if (!onboarding) {
        throw new AdminProviderManagementError(
          'Onboarding record not found',
          'ONBOARDING_NOT_FOUND',
          404
        );
      }

      // Update onboarding status
      await this.adminProviderRepository.updateOnboardingStatus(
        onboardingId,
        'rejected',
        rejectionReason
      );

      // Log admin action
      await this.adminProviderRepository.logAdminAction({
        id: uuidv4(),
        adminId,
        providerId: onboarding.providerId,
        action: 'provider_rejected',
        details: {
          description: `Rejected provider onboarding for ${onboarding.companyName}`,
          reason: rejectionReason
        },
        timestamp: new Date().toISOString()
      });

      // Send rejection notification
      await this.notificationService.sendProviderRejectionNotification({
        type: 'provider_rejected',
        providerId: onboarding.providerId,
        providerName: onboarding.companyName,
        providerEmail: onboarding.businessEmail,
        rejectionReason,
        rejectedBy: adminId
      });

      this.logger.info('Provider onboarding rejected', {
        onboardingId,
        providerId: onboarding.providerId,
        rejectedBy: adminId,
        reason: rejectionReason
      });
    } catch (error) {
      this.logger.error('Failed to reject provider onboarding', { error, onboardingId, adminId });
      throw error;
    }
  }

  async createCustomerServiceRequest(
    providerId: string,
    requestData: Omit<CustomerServiceRequest, 'id' | 'createdAt' | 'updatedAt'>,
    adminId: string
  ): Promise<string> {
    try {
      const requestId = uuidv4();
      
      const serviceRequest: CustomerServiceRequest = {
        id: requestId,
        ...requestData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await this.adminProviderRepository.createServiceRequest(serviceRequest);

      // Assign engineer based on request type and complexity
      const assignedEngineer = await this.assignEnginner(serviceRequest);
      if (assignedEngineer) {
        await this.adminProviderRepository.updateServiceRequestAssignment(
          requestId,
          assignedEngineer
        );
      }

      // Send notification to engineering team
      await this.notificationService.sendServiceRequestNotification({
        type: 'new_service_request',
        requestId,
        providerId,
        requestType: requestData.requestType,
        priority: requestData.priority,
        assignedEngineer
      });

      // Log admin action
      await this.adminProviderRepository.logAdminAction({
        id: uuidv4(),
        adminId,
        providerId,
        action: 'service_request_created' as any,
        details: {
          description: `Created service request: ${requestData.requestType}`,
          newValue: { requestId, requestType: requestData.requestType }
        },
        timestamp: new Date().toISOString()
      });

      this.logger.info('Customer service request created', {
        requestId,
        providerId,
        requestType: requestData.requestType,
        createdBy: adminId
      });

      return requestId;
    } catch (error) {
      this.logger.error('Failed to create service request', { error, providerId, adminId });
      throw error;
    }
  }

  async getProviderOnboardingList(filters: {
    status?: string;
    priority?: string;
    assignedAdmin?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    onboardings: any[];
    total: number;
    offset: number;
  }> {
    try {
      return await this.adminProviderRepository.findOnboardings(filters);
    } catch (error) {
      this.logger.error('Failed to get provider onboarding list', { error, filters });
      throw error;
    }
  }

  async getProviderDetails(providerId: string): Promise<any> {
    try {
      const provider = await this.adminProviderRepository.findProviderById(providerId);
      const integrationConfig = await this.adminProviderRepository.findIntegrationConfig(providerId);
      const marginConfig = await this.adminProviderRepository.findMarginConfig(providerId);
      const serviceRequests = await this.adminProviderRepository.findServiceRequests(providerId);
      const performance = await this.adminProviderRepository.getProviderPerformance(providerId);

      return {
        provider,
        integrationConfig,
        marginConfig,
        serviceRequests,
        performance
      };
    } catch (error) {
      this.logger.error('Failed to get provider details', { error, providerId });
      throw error;
    }
  }

  async updateMarginConfiguration(
    providerId: string,
    marginConfig: MarginConfiguration,
    adminId: string
  ): Promise<void> {
    try {
      const previousConfig = await this.adminProviderRepository.findMarginConfig(providerId);
      
      await this.adminProviderRepository.updateMarginConfiguration(providerId, marginConfig);

      // Log admin action
      await this.adminProviderRepository.logAdminAction({
        id: uuidv4(),
        adminId,
        providerId,
        action: 'margin_updated',
        details: {
          description: 'Updated margin configuration',
          previousValue: previousConfig,
          newValue: marginConfig
        },
        timestamp: new Date().toISOString()
      });

      // Notify provider of margin changes
      await this.notificationService.sendMarginUpdateNotification({
        type: 'margin_updated',
        providerId,
        newMarginStructure: marginConfig.marginStructure,
        effectiveDate: marginConfig.effectiveDate,
        updatedBy: adminId
      });

      this.logger.info('Margin configuration updated', {
        providerId,
        updatedBy: adminId
      });
    } catch (error) {
      this.logger.error('Failed to update margin configuration', { error, providerId, adminId });
      throw error;
    }
  }

  private async createIntegrationServiceConfig(
    providerId: string,
    onboardingData: AdminProviderOnboarding,
    adminId: string
  ): Promise<void> {
    const integrationConfig: IntegrationServiceConfig = {
      providerId,
      serviceLevel: this.determineServiceLevel(onboardingData.integrationService),
      services: {
        apiDevelopment: onboardingData.integrationService.apiReadiness === 'none',
        webhookSetup: true,
        dataMapping: true,
        testingSupport: true,
        goLiveSupport: true,
        ongoingMaintenance: onboardingData.integrationService.dedicatedSupport,
        customizations: []
      },
      timeline: {
        estimatedWeeks: onboardingData.integrationService.timelineWeeks,
        milestones: this.generateIntegrationMilestones(onboardingData.integrationService)
      },
      costs: this.calculateIntegrationCosts(onboardingData.integrationService),
      status: 'pending',
      contractSigned: false
    };

    await this.adminProviderRepository.createIntegrationConfig(integrationConfig);
  }

  private async createInitialMarginConfiguration(
    providerId: string,
    onboardingData: AdminProviderOnboarding,
    adminId: string
  ): Promise<void> {
    const marginConfig: MarginConfiguration = {
      providerId,
      marginStructure: {
        type: onboardingData.revenueModel.feeStructure === 'percentage' ? 'fixed_percentage' : 'tiered',
        basePercentage: onboardingData.revenueModel.feePercentage || 5.0
      },
      minimumMargin: onboardingData.revenueModel.minimumFee || 0,
      maximumMargin: 25.0, // Default max margin
      adjustmentRules: [],
      reviewFrequency: 'quarterly',
      nextReview: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
      approvedBy: adminId,
      effectiveDate: new Date().toISOString(),
      notes: `Initial margin configuration based on onboarding data`
    };

    await this.adminProviderRepository.createMarginConfig(marginConfig);
  }

  private async createProviderInMainSystem(onboarding: any): Promise<string> {
    // This would integrate with the main credit providers service
    // to create the actual provider record
    
    // For now, return the existing provider ID
    return onboarding.providerId;
  }

  private determineServiceLevel(integrationService: any): 'basic' | 'standard' | 'premium' {
    if (integrationService.integrationComplexity === 'complex' || integrationService.dedicatedSupport) {
      return 'premium';
    } else if (integrationService.integrationComplexity === 'moderate') {
      return 'standard';
    }
    return 'basic';
  }

  private generateIntegrationMilestones(integrationService: any): any[] {
    const milestones = [
      {
        name: 'Requirements Analysis',
        description: 'Analyze technical requirements and create integration plan',
        estimatedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const
      },
      {
        name: 'API Development',
        description: 'Develop custom API endpoints and integration layer',
        estimatedDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const
      },
      {
        name: 'Testing & Validation',
        description: 'Comprehensive testing of integration',
        estimatedDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const
      },
      {
        name: 'Go Live',
        description: 'Deploy to production and monitor',
        estimatedDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const
      }
    ];

    return milestones;
  }

  private calculateIntegrationCosts(integrationService: any): any {
    let setupFee = 2500; // Base setup fee
    let monthlyFee = 0;
    let customizationFee = 0;

    switch (integrationService.integrationComplexity) {
      case 'complex':
        setupFee = 7500;
        customizationFee = 5000;
        break;
      case 'moderate':
        setupFee = 5000;
        customizationFee = 2500;
        break;
      case 'simple':
        setupFee = 2500;
        break;
    }

    if (integrationService.dedicatedSupport) {
      monthlyFee = 1500;
    }

    return {
      setupFee,
      monthlyFee,
      customizationFee,
      totalEstimate: setupFee + customizationFee + (monthlyFee * 12)
    };
  }

  private async assignEnginner(serviceRequest: CustomerServiceRequest): Promise<string | undefined> {
    // Simple assignment logic - in production, this would be more sophisticated
    const engineers = await this.adminProviderRepository.getAvailableEngineers();
    
    if (engineers.length === 0) {
      return undefined;
    }

    // Assign based on workload and expertise
    const assignedEngineer = engineers.find(engineer => 
      engineer.expertise.includes(serviceRequest.requestType) && 
      engineer.currentWorkload < 5
    ) || engineers[0];

    return assignedEngineer.id;
  }
}