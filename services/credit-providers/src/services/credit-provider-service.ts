import { Logger } from '@caas/common';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { 
  CreditProvider, 
  CreditProviderRegistration,
  ProviderAPIPlugin,
  LeadStatusUpdate
} from '../types/credit-provider';
import { CreditProviderRepository } from '../repositories/credit-provider-repository';
import { WebhookService } from './webhook-service';
import { NotificationService } from './notification-service';

export class CreditProviderService {
  private logger: Logger;
  private repository: CreditProviderRepository;
  private webhookService: WebhookService;
  private notificationService: NotificationService;

  constructor(
    logger: Logger,
    repository: CreditProviderRepository,
    webhookService: WebhookService,
    notificationService: NotificationService
  ) {
    this.logger = logger;
    this.repository = repository;
    this.webhookService = webhookService;
    this.notificationService = notificationService;
  }

  async registerProvider(registrationData: CreditProviderRegistration): Promise<{
    providerId: string;
    status: string;
    apiCredentials?: {
      providerId: string;
      apiKey: string;
      webhookSecret: string;
    };
  }> {
    try {
      const providerId = `provider_${uuidv4()}`;
      const apiKey = this.generateAPIKey();
      const webhookSecret = this.generateWebhookSecret();

      // Validate business information
      await this.validateBusinessRegistration(registrationData);

      // Check for duplicate registrations
      const existingProvider = await this.repository.findByEmail(registrationData.businessEmail);
      if (existingProvider) {
        throw new Error('Provider with this email already exists');
      }

      const provider: CreditProvider = {
        id: providerId,
        registrationData,
        status: 'pending',
        apiCredentials: {
          providerId,
          apiKey,
          webhookSecret,
          lastRotated: new Date(),
        },
        integrationSettings: {
          enabledFeatures: ['basic_lead_distribution'],
          leadCategories: ['personal_loan', 'business_loan'],
          autoApprovalRules: {},
          customFields: {},
        },
        performance: {
          totalLeadsReceived: 0,
          totalLeadsProcessed: 0,
          averageResponseTime: 0,
          approvalRate: 0,
          disbursementRate: 0,
          lastActivity: new Date(),
        },
        billing: {
          plan: 'basic',
          costPerLead: 5.0, // USD
          monthlyFee: 100.0, // USD
          lastBillingDate: new Date(),
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paymentStatus: 'current',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.repository.create(provider);

      // Send registration confirmation
      await this.notificationService.sendRegistrationConfirmation(provider);

      // Notify admin team for review
      await this.notificationService.notifyAdminOfNewRegistration(provider);

      this.logger.info('Credit provider registered successfully', {
        providerId,
        companyName: registrationData.companyName,
        businessType: registrationData.businessRegistration.businessType,
      });

      return {
        providerId,
        status: 'pending',
        apiCredentials: {
          providerId,
          apiKey,
          webhookSecret,
        },
      };
    } catch (error) {
      this.logger.error('Failed to register credit provider', { error, registrationData });
      throw error;
    }
  }

  async getProvider(providerId: string): Promise<CreditProvider | null> {
    try {
      const provider = await this.repository.findById(providerId);
      
      if (provider) {
        // Update last activity
        await this.updateLastActivity(providerId);
      }
      
      return provider;
    } catch (error) {
      this.logger.error('Failed to get provider', { error, providerId });
      throw error;
    }
  }

  async updateProvider(providerId: string, updates: Partial<CreditProvider>): Promise<CreditProvider> {
    try {
      const existingProvider = await this.repository.findById(providerId);
      if (!existingProvider) {
        throw new Error('Provider not found');
      }

      // Validate sensitive updates
      if (updates.status && !this.isValidStatusTransition(existingProvider.status, updates.status)) {
        throw new Error(`Invalid status transition from ${existingProvider.status} to ${updates.status}`);
      }

      const updatedProvider = {
        ...existingProvider,
        ...updates,
        updatedAt: new Date(),
      };

      await this.repository.update(providerId, updatedProvider);

      // Send notifications for important updates
      if (updates.status) {
        await this.notificationService.notifyStatusChange(updatedProvider, existingProvider.status);
      }

      this.logger.info('Provider updated', { providerId, updates: Object.keys(updates) });
      
      return updatedProvider;
    } catch (error) {
      this.logger.error('Failed to update provider', { error, providerId });
      throw error;
    }
  }

  async approveProvider(providerId: string, adminId: string): Promise<{
    provider: CreditProvider;
    onboardingSteps: string[];
  }> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      if (provider.status !== 'pending' && provider.status !== 'reviewing') {
        throw new Error(`Cannot approve provider with status: ${provider.status}`);
      }

      // Perform final compliance checks
      await this.performComplianceChecks(provider);

      const updatedProvider = await this.updateProvider(providerId, {
        status: 'approved',
        approvedBy: adminId,
        approvedAt: new Date(),
      });

      // Setup initial integration configuration
      const onboardingSteps = await this.setupProviderOnboarding(updatedProvider);

      // Send approval notification
      await this.notificationService.sendApprovalNotification(updatedProvider);

      this.logger.info('Provider approved', { providerId, approvedBy: adminId });

      return {
        provider: updatedProvider,
        onboardingSteps,
      };
    } catch (error) {
      this.logger.error('Failed to approve provider', { error, providerId });
      throw error;
    }
  }

  async suspendProvider(providerId: string, reason: string, adminId: string): Promise<void> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      await this.updateProvider(providerId, {
        status: 'suspended',
        updatedAt: new Date(),
      });

      // Log suspension reason
      await this.repository.logAction(providerId, 'suspended', reason, adminId);

      // Disable API access
      await this.disableAPIAccess(providerId);

      // Send suspension notification
      await this.notificationService.sendSuspensionNotification(provider, reason);

      this.logger.warn('Provider suspended', { providerId, reason, suspendedBy: adminId });
    } catch (error) {
      this.logger.error('Failed to suspend provider', { error, providerId });
      throw error;
    }
  }

  async listProviders(filters: {
    status?: string;
    limit?: number;
    offset?: number;
    businessType?: string;
  } = {}): Promise<{
    providers: CreditProvider[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const result = await this.repository.findMany(filters);
      
      return {
        providers: result.providers,
        total: result.total,
        hasMore: result.offset + result.providers.length < result.total,
      };
    } catch (error) {
      this.logger.error('Failed to list providers', { error, filters });
      throw error;
    }
  }

  async validateAPIKey(providerId: string, apiKey: string): Promise<boolean> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        return false;
      }

      if (provider.status !== 'approved' && provider.status !== 'active') {
        return false;
      }

      const isValid = provider.apiCredentials.apiKey === apiKey;
      
      if (isValid) {
        // Update last activity
        await this.updateLastActivity(providerId);
      }

      return isValid;
    } catch (error) {
      this.logger.error('Failed to validate API key', { error, providerId });
      return false;
    }
  }

  async rotateAPICredentials(providerId: string): Promise<{
    apiKey: string;
    webhookSecret: string;
  }> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      const newAPIKey = this.generateAPIKey();
      const newWebhookSecret = this.generateWebhookSecret();

      await this.updateProvider(providerId, {
        apiCredentials: {
          ...provider.apiCredentials,
          apiKey: newAPIKey,
          webhookSecret: newWebhookSecret,
          lastRotated: new Date(),
        },
      });

      // Notify provider of credential rotation
      await this.notificationService.sendCredentialRotationNotification(provider, {
        apiKey: newAPIKey,
        webhookSecret: newWebhookSecret,
      });

      this.logger.info('API credentials rotated', { providerId });

      return {
        apiKey: newAPIKey,
        webhookSecret: newWebhookSecret,
      };
    } catch (error) {
      this.logger.error('Failed to rotate API credentials', { error, providerId });
      throw error;
    }
  }

  async getProviderPlugins(providerId: string): Promise<ProviderAPIPlugin[]> {
    try {
      return await this.repository.getProviderPlugins(providerId);
    } catch (error) {
      this.logger.error('Failed to get provider plugins', { error, providerId });
      throw error;
    }
  }

  async configureAPIPlugin(providerId: string, pluginConfig: Partial<ProviderAPIPlugin>): Promise<ProviderAPIPlugin> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // Validate plugin configuration
      await this.validatePluginConfiguration(pluginConfig);

      const plugin: ProviderAPIPlugin = {
        providerId,
        pluginName: pluginConfig.pluginName!,
        version: pluginConfig.version || '1.0.0',
        configuration: pluginConfig.configuration || {},
        isActive: pluginConfig.isActive !== false,
        lastSync: new Date(),
        syncFrequency: pluginConfig.syncFrequency || 'real_time',
        errorHandling: pluginConfig.errorHandling || {
          retryAttempts: 3,
          backoffStrategy: 'exponential',
          fallbackAction: 'queue',
        },
      };

      await this.repository.saveProviderPlugin(plugin);

      // Test plugin connectivity
      await this.testPluginConnectivity(plugin);

      this.logger.info('API plugin configured', { providerId, pluginName: plugin.pluginName });

      return plugin;
    } catch (error) {
      this.logger.error('Failed to configure API plugin', { error, providerId });
      throw error;
    }
  }

  async testProviderWebhook(providerId: string): Promise<{
    success: boolean;
    responseTime: number;
    status: number;
    message: string;
  }> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      const webhookUrl = provider.registrationData.technicalRequirements.webhookUrl;
      
      return await this.webhookService.testWebhook(providerId, webhookUrl, {
        eventType: 'webhook_test',
        timestamp: new Date(),
        data: { message: 'This is a test webhook from CAAS platform' },
      });
    } catch (error) {
      this.logger.error('Failed to test provider webhook', { error, providerId });
      throw error;
    }
  }

  async updateProviderPerformance(providerId: string, metrics: {
    responseTime?: number;
    decision?: 'approved' | 'rejected';
    disbursed?: boolean;
  }): Promise<void> {
    try {
      const provider = await this.repository.findById(providerId);
      if (!provider) {
        return;
      }

      const performance = { ...provider.performance };
      
      if (metrics.responseTime) {
        // Update average response time
        const total = performance.totalLeadsProcessed * performance.averageResponseTime;
        performance.averageResponseTime = (total + metrics.responseTime) / (performance.totalLeadsProcessed + 1);
      }

      if (metrics.decision) {
        performance.totalLeadsProcessed += 1;
        
        if (metrics.decision === 'approved') {
          // Recalculate approval rate
          const totalApproved = Math.floor(performance.totalLeadsReceived * (performance.approvalRate / 100)) + 1;
          performance.approvalRate = (totalApproved / performance.totalLeadsReceived) * 100;
        }
      }

      if (metrics.disbursed) {
        // Update disbursement rate
        const totalDisbursed = Math.floor(performance.totalLeadsReceived * (performance.disbursementRate / 100)) + 1;
        performance.disbursementRate = (totalDisbursed / performance.totalLeadsReceived) * 100;
      }

      performance.lastActivity = new Date();

      await this.updateProvider(providerId, { performance });
    } catch (error) {
      this.logger.error('Failed to update provider performance', { error, providerId });
    }
  }

  // Private helper methods
  private generateAPIKey(): string {
    return `caas_${crypto.randomBytes(32).toString('hex')}`;
  }

  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async validateBusinessRegistration(registrationData: CreditProviderRegistration): Promise<void> {
    // Validate business registration number format
    if (!registrationData.businessRegistration.registrationNumber) {
      throw new Error('Business registration number is required');
    }

    // Validate license requirements
    if (registrationData.licenses.length === 0) {
      throw new Error('At least one valid license is required');
    }

    // Validate financial capacity
    if (registrationData.creditCapacity.minimumLoanAmount >= registrationData.creditCapacity.maximumLoanAmount) {
      throw new Error('Maximum loan amount must be greater than minimum loan amount');
    }

    // Validate interest rate range
    const { minimum, maximum } = registrationData.creditCapacity.interestRateRange;
    if (minimum >= maximum || minimum < 0 || maximum > 100) {
      throw new Error('Invalid interest rate range');
    }
  }

  private isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      'pending': ['reviewing', 'rejected'],
      'reviewing': ['approved', 'rejected', 'pending'],
      'approved': ['active', 'suspended'],
      'active': ['suspended', 'inactive'],
      'suspended': ['active', 'rejected'],
      'inactive': ['active'],
      'rejected': [], // Final state
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  private async performComplianceChecks(provider: CreditProvider): Promise<void> {
    // Check license validity
    for (const license of provider.registrationData.licenses) {
      const expiryDate = new Date(license.expiryDate);
      if (expiryDate <= new Date()) {
        throw new Error(`License ${license.licenseNumber} has expired`);
      }
    }

    // Verify regulatory approvals
    if (provider.registrationData.compliance.regulatoryApprovals.length === 0) {
      throw new Error('At least one regulatory approval is required');
    }

    // Additional compliance checks can be added here
  }

  private async setupProviderOnboarding(provider: CreditProvider): Promise<string[]> {
    const onboardingSteps = [
      'Complete API integration testing',
      'Configure webhook endpoints',
      'Set up lead processing workflows',
      'Configure dashboard preferences',
      'Complete first test transaction',
    ];

    // Create onboarding checklist in database
    await this.repository.createOnboardingChecklist(provider.id, onboardingSteps);

    return onboardingSteps;
  }

  private async disableAPIAccess(providerId: string): Promise<void> {
    // Add provider to API blacklist (implementation depends on your API gateway)
    await this.repository.updateAPIAccess(providerId, false);
    
    this.logger.info('API access disabled for provider', { providerId });
  }

  private async updateLastActivity(providerId: string): Promise<void> {
    try {
      await this.repository.updateLastActivity(providerId, new Date());
    } catch (error) {
      // Don't throw error for activity updates
      this.logger.warn('Failed to update last activity', { error, providerId });
    }
  }

  private async validatePluginConfiguration(config: Partial<ProviderAPIPlugin>): Promise<void> {
    if (!config.pluginName) {
      throw new Error('Plugin name is required');
    }

    if (!config.configuration) {
      throw new Error('Plugin configuration is required');
    }

    // Validate endpoint URLs if provided
    if (config.configuration.endpoints) {
      for (const [key, url] of Object.entries(config.configuration.endpoints)) {
        try {
          new URL(url as string);
        } catch {
          throw new Error(`Invalid URL for endpoint ${key}: ${url}`);
        }
      }
    }
  }

  private async testPluginConnectivity(plugin: ProviderAPIPlugin): Promise<void> {
    try {
      if (plugin.configuration.endpoints?.baseUrl) {
        // Test basic connectivity to plugin endpoint
        const response = await fetch(plugin.configuration.endpoints.baseUrl, {
          method: 'HEAD',
          timeout: 5000,
        });
        
        if (!response.ok) {
          this.logger.warn('Plugin connectivity test failed', {
            providerId: plugin.providerId,
            pluginName: plugin.pluginName,
            status: response.status,
          });
        }
      }
    } catch (error) {
      this.logger.warn('Plugin connectivity test error', {
        providerId: plugin.providerId,
        pluginName: plugin.pluginName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}