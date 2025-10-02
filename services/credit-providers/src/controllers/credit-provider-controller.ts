import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from '@caas/common';
import { CreditProviderService } from '../services/credit-provider-service';
import { LeadDistributionService } from '../services/lead-distribution-service';
import { ProviderAnalyticsService } from '../services/provider-analytics-service';
import { 
  CreditProviderRegistrationSchema, 
  LeadDataSchema,
  ProviderLoanDecisionSchema,
  CreditProvider,
  LeadData,
  ProviderLoanDecision,
  ProviderAnalytics 
} from '../types/credit-provider';

export class CreditProviderController {
  private logger: Logger;
  private creditProviderService: CreditProviderService;
  private leadDistributionService: LeadDistributionService;
  private analyticsService: ProviderAnalyticsService;

  constructor(
    logger: Logger,
    creditProviderService: CreditProviderService,
    leadDistributionService: LeadDistributionService,
    analyticsService: ProviderAnalyticsService
  ) {
    this.logger = logger;
    this.creditProviderService = creditProviderService;
    this.leadDistributionService = leadDistributionService;
    this.analyticsService = analyticsService;
  }

  public async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Provider Registration & Management
    fastify.post('/api/v1/providers/register', {
      schema: {
        description: 'Register new credit provider',
        tags: ['Credit Providers'],
        body: CreditProviderRegistrationSchema,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              providerId: { type: 'string' },
              status: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      }
    }, this.registerProvider.bind(this));

    fastify.get('/api/v1/providers/:providerId', {
      schema: {
        description: 'Get provider details',
        tags: ['Credit Providers'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin', 'provider'])]
    }, this.getProvider.bind(this));

    fastify.patch('/api/v1/providers/:providerId', {
      schema: {
        description: 'Update provider information',
        tags: ['Credit Providers'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin', 'provider'])]
    }, this.updateProvider.bind(this));

    fastify.post('/api/v1/providers/:providerId/approve', {
      schema: {
        description: 'Approve provider registration',
        tags: ['Credit Providers'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])]
    }, this.approveProvider.bind(this));

    fastify.post('/api/v1/providers/:providerId/suspend', {
      schema: {
        description: 'Suspend provider',
        tags: ['Credit Providers'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])]
    }, this.suspendProvider.bind(this));

    // Lead Distribution & Management
    fastify.post('/api/v1/leads/distribute', {
      schema: {
        description: 'Distribute lead to credit providers',
        tags: ['Lead Distribution'],
        body: LeadDataSchema
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin', 'system'])]
    }, this.distributeLeadToProviders.bind(this));

    fastify.get('/api/v1/providers/:providerId/leads', {
      schema: {
        description: 'Get leads assigned to provider',
        tags: ['Lead Distribution'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        },
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
            startDate: { type: 'string' },
            endDate: { type: 'string' }
          }
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider', 'admin'])]
    }, this.getProviderLeads.bind(this));

    fastify.post('/api/v1/providers/:providerId/leads/:leadId/decision', {
      schema: {
        description: 'Submit loan decision for lead',
        tags: ['Lead Management'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' },
            leadId: { type: 'string' }
          },
          required: ['providerId', 'leadId']
        },
        body: ProviderLoanDecisionSchema
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider'])]
    }, this.submitLoanDecision.bind(this));

    // Provider Analytics & Dashboard
    fastify.get('/api/v1/providers/:providerId/analytics', {
      schema: {
        description: 'Get provider analytics',
        tags: ['Provider Analytics'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        },
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['7d', '30d', '90d', '1y'], default: '30d' },
            metrics: { type: 'string' }
          }
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider', 'admin'])]
    }, this.getProviderAnalytics.bind(this));

    fastify.get('/api/v1/providers/:providerId/dashboard', {
      schema: {
        description: 'Get provider dashboard data',
        tags: ['Provider Dashboard'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider', 'admin'])]
    }, this.getProviderDashboard.bind(this));

    // API Plugin Management
    fastify.get('/api/v1/providers/:providerId/plugins', {
      schema: {
        description: 'Get provider API plugins',
        tags: ['API Plugins'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider', 'admin'])]
    }, this.getProviderPlugins.bind(this));

    fastify.post('/api/v1/providers/:providerId/plugins', {
      schema: {
        description: 'Configure API plugin for provider',
        tags: ['API Plugins'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider', 'admin'])]
    }, this.configureAPIPlugin.bind(this));

    // Webhook Management
    fastify.post('/api/v1/providers/:providerId/webhook/test', {
      schema: {
        description: 'Test provider webhook endpoint',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' }
          },
          required: ['providerId']
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['provider', 'admin'])]
    }, this.testProviderWebhook.bind(this));

    // Public API for Credit Providers
    fastify.post('/api/v1/public/providers/:providerId/leads/:leadId/status', {
      schema: {
        description: 'Update lead status from provider',
        tags: ['Provider Public API'],
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string' },
            leadId: { type: 'string' }
          },
          required: ['providerId', 'leadId']
        }
      },
      preHandler: [this.validateProviderAPIKey.bind(this)]
    }, this.updateLeadStatus.bind(this));

    // Admin Routes
    fastify.get('/api/v1/admin/providers', {
      schema: {
        description: 'List all providers (admin only)',
        tags: ['Admin - Credit Providers'],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 }
          }
        }
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])]
    }, this.listAllProviders.bind(this));

    fastify.get('/api/v1/admin/analytics/overview', {
      schema: {
        description: 'Get platform-wide provider analytics',
        tags: ['Admin - Analytics']
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])]
    }, this.getPlatformAnalytics.bind(this));
  }

  // Provider Registration & Management Methods
  private async registerProvider(
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const registrationData = CreditProviderRegistrationSchema.parse(request.body);
      
      const result = await this.creditProviderService.registerProvider(registrationData);
      
      this.logger.info('New credit provider registered', {
        providerId: result.providerId,
        companyName: registrationData.companyName,
        businessEmail: registrationData.businessEmail
      });

      reply.status(201).send({
        success: true,
        providerId: result.providerId,
        status: result.status,
        message: 'Provider registration submitted successfully. Review process will begin shortly.'
      });
    } catch (error) {
      this.logger.error('Failed to register credit provider', { error });
      reply.status(400).send({
        success: false,
        message: error instanceof Error ? error.message : 'Registration failed'
      });
    }
  }

  private async getProvider(
    request: FastifyRequest<{ Params: { providerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const provider = await this.creditProviderService.getProvider(providerId);
      
      if (!provider) {
        reply.status(404).send({ success: false, message: 'Provider not found' });
        return;
      }

      // Filter sensitive data based on user role
      const filteredProvider = this.filterProviderData(provider, request.user?.role);
      
      reply.send({ success: true, provider: filteredProvider });
    } catch (error) {
      this.logger.error('Failed to get provider', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to retrieve provider' });
    }
  }

  private async updateProvider(
    request: FastifyRequest<{ Params: { providerId: string }; Body: any }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const updates = request.body;
      
      const updatedProvider = await this.creditProviderService.updateProvider(providerId, updates);
      
      this.logger.info('Provider updated', { providerId, updatedFields: Object.keys(updates) });
      
      reply.send({ success: true, provider: updatedProvider });
    } catch (error) {
      this.logger.error('Failed to update provider', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to update provider' });
    }
  }

  private async approveProvider(
    request: FastifyRequest<{ Params: { providerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const adminId = request.user?.id;
      
      const result = await this.creditProviderService.approveProvider(providerId, adminId);
      
      this.logger.info('Provider approved', { providerId, approvedBy: adminId });
      
      reply.send({ success: true, message: 'Provider approved successfully', result });
    } catch (error) {
      this.logger.error('Failed to approve provider', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to approve provider' });
    }
  }

  private async suspendProvider(
    request: FastifyRequest<{ Params: { providerId: string }; Body: { reason: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const { reason } = request.body;
      const adminId = request.user?.id;
      
      await this.creditProviderService.suspendProvider(providerId, reason, adminId);
      
      this.logger.warn('Provider suspended', { providerId, reason, suspendedBy: adminId });
      
      reply.send({ success: true, message: 'Provider suspended successfully' });
    } catch (error) {
      this.logger.error('Failed to suspend provider', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to suspend provider' });
    }
  }

  // Lead Distribution Methods
  private async distributeLeadToProviders(
    request: FastifyRequest<{ Body: LeadData }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const leadData = LeadDataSchema.parse(request.body);
      
      const distribution = await this.leadDistributionService.distributeLead(leadData);
      
      this.logger.info('Lead distributed to providers', {
        leadId: leadData.leadId,
        providersCount: distribution.providersNotified,
        distributionId: distribution.distributionId
      });
      
      reply.send({
        success: true,
        distributionId: distribution.distributionId,
        providersNotified: distribution.providersNotified,
        estimatedResponseTime: distribution.estimatedResponseTime
      });
    } catch (error) {
      this.logger.error('Failed to distribute lead', { error });
      reply.status(500).send({ success: false, message: 'Failed to distribute lead' });
    }
  }

  private async getProviderLeads(
    request: FastifyRequest<{ 
      Params: { providerId: string };
      Querystring: { status?: string; limit: number; offset: number; startDate?: string; endDate?: string }
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const { status, limit, offset, startDate, endDate } = request.query;
      
      const leads = await this.leadDistributionService.getProviderLeads(providerId, {
        status,
        limit,
        offset,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      reply.send({ success: true, leads });
    } catch (error) {
      this.logger.error('Failed to get provider leads', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to retrieve leads' });
    }
  }

  private async submitLoanDecision(
    request: FastifyRequest<{ 
      Params: { providerId: string; leadId: string };
      Body: ProviderLoanDecision 
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId, leadId } = request.params;
      const decision = ProviderLoanDecisionSchema.parse(request.body);
      
      const result = await this.leadDistributionService.processProviderDecision(providerId, leadId, decision);
      
      this.logger.info('Loan decision submitted', {
        providerId,
        leadId,
        decision: decision.decision,
        approvedAmount: decision.approvedAmount
      });
      
      reply.send({ success: true, result });
    } catch (error) {
      this.logger.error('Failed to submit loan decision', { 
        error, 
        providerId: request.params.providerId,
        leadId: request.params.leadId 
      });
      reply.status(500).send({ success: false, message: 'Failed to submit decision' });
    }
  }

  // Analytics Methods
  private async getProviderAnalytics(
    request: FastifyRequest<{ 
      Params: { providerId: string };
      Querystring: { period: string; metrics?: string }
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const { period, metrics } = request.query;
      
      const analytics = await this.analyticsService.getProviderAnalytics(providerId, period, metrics?.split(','));
      
      reply.send({ success: true, analytics });
    } catch (error) {
      this.logger.error('Failed to get provider analytics', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to retrieve analytics' });
    }
  }

  private async getProviderDashboard(
    request: FastifyRequest<{ Params: { providerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      
      const dashboard = await this.analyticsService.getProviderDashboard(providerId);
      
      reply.send({ success: true, dashboard });
    } catch (error) {
      this.logger.error('Failed to get provider dashboard', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to retrieve dashboard' });
    }
  }

  // Plugin Management Methods
  private async getProviderPlugins(
    request: FastifyRequest<{ Params: { providerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      
      const plugins = await this.creditProviderService.getProviderPlugins(providerId);
      
      reply.send({ success: true, plugins });
    } catch (error) {
      this.logger.error('Failed to get provider plugins', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to retrieve plugins' });
    }
  }

  private async configureAPIPlugin(
    request: FastifyRequest<{ Params: { providerId: string }; Body: any }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      const pluginConfig = request.body;
      
      const result = await this.creditProviderService.configureAPIPlugin(providerId, pluginConfig);
      
      this.logger.info('API plugin configured', { providerId, pluginName: pluginConfig.pluginName });
      
      reply.send({ success: true, result });
    } catch (error) {
      this.logger.error('Failed to configure API plugin', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Failed to configure plugin' });
    }
  }

  // Webhook Methods
  private async testProviderWebhook(
    request: FastifyRequest<{ Params: { providerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId } = request.params;
      
      const result = await this.creditProviderService.testProviderWebhook(providerId);
      
      reply.send({ success: true, result });
    } catch (error) {
      this.logger.error('Failed to test provider webhook', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Webhook test failed' });
    }
  }

  // Public API Methods
  private async validateProviderAPIKey(
    request: FastifyRequest<{ Params: { providerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const apiKey = request.headers['x-api-key'] as string;
      const { providerId } = request.params;
      
      if (!apiKey) {
        reply.status(401).send({ success: false, message: 'API key required' });
        return;
      }
      
      const isValid = await this.creditProviderService.validateAPIKey(providerId, apiKey);
      
      if (!isValid) {
        reply.status(401).send({ success: false, message: 'Invalid API key' });
        return;
      }
      
      // Add provider info to request for downstream handlers
      request.provider = { id: providerId };
    } catch (error) {
      this.logger.error('API key validation failed', { error, providerId: request.params.providerId });
      reply.status(500).send({ success: false, message: 'Authentication failed' });
    }
  }

  private async updateLeadStatus(
    request: FastifyRequest<{ 
      Params: { providerId: string; leadId: string };
      Body: { status: string; statusMessage: string; metadata?: any }
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { providerId, leadId } = request.params;
      const { status, statusMessage, metadata } = request.body;
      
      await this.leadDistributionService.updateLeadStatus(providerId, leadId, {
        status,
        statusMessage,
        metadata
      });
      
      this.logger.info('Lead status updated via API', { providerId, leadId, status });
      
      reply.send({ success: true, message: 'Status updated successfully' });
    } catch (error) {
      this.logger.error('Failed to update lead status', { 
        error, 
        providerId: request.params.providerId,
        leadId: request.params.leadId 
      });
      reply.status(500).send({ success: false, message: 'Failed to update status' });
    }
  }

  // Admin Methods
  private async listAllProviders(
    request: FastifyRequest<{ 
      Querystring: { status?: string; limit: number; offset: number }
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { status, limit, offset } = request.query;
      
      const providers = await this.creditProviderService.listProviders({ status, limit, offset });
      
      reply.send({ success: true, providers });
    } catch (error) {
      this.logger.error('Failed to list providers', { error });
      reply.status(500).send({ success: false, message: 'Failed to retrieve providers' });
    }
  }

  private async getPlatformAnalytics(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const analytics = await this.analyticsService.getPlatformAnalytics();
      
      reply.send({ success: true, analytics });
    } catch (error) {
      this.logger.error('Failed to get platform analytics', { error });
      reply.status(500).send({ success: false, message: 'Failed to retrieve analytics' });
    }
  }

  // Helper Methods
  private filterProviderData(provider: CreditProvider, userRole?: string): Partial<CreditProvider> {
    if (userRole === 'admin') {
      return provider; // Admin sees everything
    }
    
    // Filter sensitive data for non-admin users
    const filtered = { ...provider };
    delete (filtered as any).apiCredentials;
    delete (filtered as any).billing;
    
    return filtered;
  }
}