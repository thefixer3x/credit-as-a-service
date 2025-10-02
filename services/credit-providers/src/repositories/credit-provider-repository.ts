import { Logger } from '@caas/common';
import { Pool } from 'pg';
import { 
  CreditProvider, 
  ProviderAPIPlugin,
  LeadStatusUpdate 
} from '../types/credit-provider';

export class CreditProviderRepository {
  private logger: Logger;
  private db: Pool;

  constructor(logger: Logger, db: Pool) {
    this.logger = logger;
    this.db = db;
  }

  async create(provider: CreditProvider): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const providerQuery = `
        INSERT INTO credit_providers (
          id, company_name, business_email, contact_person, phone_number, website,
          business_address, business_registration, licenses, credit_capacity,
          technical_requirements, compliance, status, api_credentials,
          integration_settings, performance, billing, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `;

      await client.query(providerQuery, [
        provider.id,
        provider.registrationData.companyName,
        provider.registrationData.businessEmail,
        provider.registrationData.contactPerson,
        provider.registrationData.phoneNumber,
        provider.registrationData.website,
        JSON.stringify(provider.registrationData.businessAddress),
        JSON.stringify(provider.registrationData.businessRegistration),
        JSON.stringify(provider.registrationData.licenses),
        JSON.stringify(provider.registrationData.creditCapacity),
        JSON.stringify(provider.registrationData.technicalRequirements),
        JSON.stringify(provider.registrationData.compliance),
        provider.status,
        JSON.stringify(provider.apiCredentials),
        JSON.stringify(provider.integrationSettings),
        JSON.stringify(provider.performance),
        JSON.stringify(provider.billing),
        provider.createdAt,
        provider.updatedAt,
      ]);

      await client.query('COMMIT');
      
      this.logger.info('Credit provider created in database', { providerId: provider.id });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create credit provider', { error, providerId: provider.id });
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<CreditProvider | null> {
    try {
      const query = 'SELECT * FROM credit_providers WHERE id = $1';
      const result = await this.db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToProvider(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find provider by ID', { error, providerId: id });
      throw error;
    }
  }

  async findByEmail(email: string): Promise<CreditProvider | null> {
    try {
      const query = 'SELECT * FROM credit_providers WHERE business_email = $1';
      const result = await this.db.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToProvider(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to find provider by email', { error, email });
      throw error;
    }
  }

  async update(id: string, provider: Partial<CreditProvider>): Promise<void> {
    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (provider.registrationData) {
        updateFields.push(`company_name = $${paramIndex++}`);
        values.push(provider.registrationData.companyName);
        
        updateFields.push(`business_email = $${paramIndex++}`);
        values.push(provider.registrationData.businessEmail);
        
        updateFields.push(`contact_person = $${paramIndex++}`);
        values.push(provider.registrationData.contactPerson);
        
        updateFields.push(`phone_number = $${paramIndex++}`);
        values.push(provider.registrationData.phoneNumber);
        
        updateFields.push(`website = $${paramIndex++}`);
        values.push(provider.registrationData.website);
        
        updateFields.push(`business_address = $${paramIndex++}`);
        values.push(JSON.stringify(provider.registrationData.businessAddress));
        
        updateFields.push(`business_registration = $${paramIndex++}`);
        values.push(JSON.stringify(provider.registrationData.businessRegistration));
        
        updateFields.push(`licenses = $${paramIndex++}`);
        values.push(JSON.stringify(provider.registrationData.licenses));
        
        updateFields.push(`credit_capacity = $${paramIndex++}`);
        values.push(JSON.stringify(provider.registrationData.creditCapacity));
        
        updateFields.push(`technical_requirements = $${paramIndex++}`);
        values.push(JSON.stringify(provider.registrationData.technicalRequirements));
        
        updateFields.push(`compliance = $${paramIndex++}`);
        values.push(JSON.stringify(provider.registrationData.compliance));
      }

      if (provider.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(provider.status);
      }

      if (provider.apiCredentials) {
        updateFields.push(`api_credentials = $${paramIndex++}`);
        values.push(JSON.stringify(provider.apiCredentials));
      }

      if (provider.integrationSettings) {
        updateFields.push(`integration_settings = $${paramIndex++}`);
        values.push(JSON.stringify(provider.integrationSettings));
      }

      if (provider.performance) {
        updateFields.push(`performance = $${paramIndex++}`);
        values.push(JSON.stringify(provider.performance));
      }

      if (provider.billing) {
        updateFields.push(`billing = $${paramIndex++}`);
        values.push(JSON.stringify(provider.billing));
      }

      if (provider.approvedBy) {
        updateFields.push(`approved_by = $${paramIndex++}`);
        values.push(provider.approvedBy);
      }

      if (provider.approvedAt) {
        updateFields.push(`approved_at = $${paramIndex++}`);
        values.push(provider.approvedAt);
      }

      updateFields.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());

      values.push(id);

      const query = `
        UPDATE credit_providers 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex}
      `;

      await this.db.query(query, values);
      
      this.logger.info('Credit provider updated', { providerId: id });
    } catch (error) {
      this.logger.error('Failed to update credit provider', { error, providerId: id });
      throw error;
    }
  }

  async findMany(filters: {
    status?: string;
    limit?: number;
    offset?: number;
    businessType?: string;
  } = {}): Promise<{
    providers: CreditProvider[];
    total: number;
    offset: number;
  }> {
    try {
      let whereClause = 'WHERE 1=1';
      const values = [];
      let paramIndex = 1;

      if (filters.status) {
        whereClause += ` AND status = $${paramIndex++}`;
        values.push(filters.status);
      }

      if (filters.businessType) {
        whereClause += ` AND business_registration->>'businessType' = $${paramIndex++}`;
        values.push(filters.businessType);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM credit_providers ${whereClause}`;
      const countResult = await this.db.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get providers with pagination
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;
      
      const query = `
        SELECT * FROM credit_providers 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      values.push(limit, offset);
      const result = await this.db.query(query, values);

      const providers = result.rows.map(row => this.mapRowToProvider(row));

      return {
        providers,
        total,
        offset,
      };
    } catch (error) {
      this.logger.error('Failed to find providers', { error, filters });
      throw error;
    }
  }

  async findEligibleProviders(criteria: {
    status: string;
    minimumAmount: number;
    maximumAmount: number;
    geographicCoverage: string;
    supportedCurrencies: string[];
  }): Promise<CreditProvider[]> {
    try {
      const query = `
        SELECT * FROM credit_providers 
        WHERE status = $1
          AND (credit_capacity->>'minimumLoanAmount')::numeric <= $2
          AND (credit_capacity->>'maximumLoanAmount')::numeric >= $3
          AND credit_capacity->'geographicCoverage' @> $4
          AND credit_capacity->'supportedCurrencies' && $5
        ORDER BY performance->>'approvalRate' DESC, performance->>'averageResponseTime' ASC
      `;

      const result = await this.db.query(query, [
        criteria.status,
        criteria.minimumAmount,
        criteria.maximumAmount,
        JSON.stringify([criteria.geographicCoverage]),
        JSON.stringify(criteria.supportedCurrencies),
      ]);

      return result.rows.map(row => this.mapRowToProvider(row));
    } catch (error) {
      this.logger.error('Failed to find eligible providers', { error, criteria });
      throw error;
    }
  }

  async getProviderPlugins(providerId: string): Promise<ProviderAPIPlugin[]> {
    try {
      const query = 'SELECT * FROM provider_api_plugins WHERE provider_id = $1 ORDER BY created_at DESC';
      const result = await this.db.query(query, [providerId]);

      return result.rows.map(row => ({
        providerId: row.provider_id,
        pluginName: row.plugin_name,
        version: row.version,
        configuration: JSON.parse(row.configuration),
        isActive: row.is_active,
        lastSync: row.last_sync,
        syncFrequency: row.sync_frequency,
        errorHandling: JSON.parse(row.error_handling),
      }));
    } catch (error) {
      this.logger.error('Failed to get provider plugins', { error, providerId });
      throw error;
    }
  }

  async saveProviderPlugin(plugin: ProviderAPIPlugin): Promise<void> {
    try {
      const query = `
        INSERT INTO provider_api_plugins (
          provider_id, plugin_name, version, configuration, is_active,
          last_sync, sync_frequency, error_handling, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (provider_id, plugin_name) 
        DO UPDATE SET
          version = $3,
          configuration = $4,
          is_active = $5,
          last_sync = $6,
          sync_frequency = $7,
          error_handling = $8,
          updated_at = $10
      `;

      await this.db.query(query, [
        plugin.providerId,
        plugin.pluginName,
        plugin.version,
        JSON.stringify(plugin.configuration),
        plugin.isActive,
        plugin.lastSync,
        plugin.syncFrequency,
        JSON.stringify(plugin.errorHandling),
        new Date(),
        new Date(),
      ]);

      this.logger.info('Provider plugin saved', { 
        providerId: plugin.providerId, 
        pluginName: plugin.pluginName 
      });
    } catch (error) {
      this.logger.error('Failed to save provider plugin', { error, plugin });
      throw error;
    }
  }

  async logAction(providerId: string, action: string, reason: string, adminId: string): Promise<void> {
    try {
      const query = `
        INSERT INTO provider_action_logs (
          provider_id, action, reason, admin_id, created_at
        ) VALUES ($1, $2, $3, $4, $5)
      `;

      await this.db.query(query, [providerId, action, reason, adminId, new Date()]);
      
      this.logger.info('Provider action logged', { providerId, action, adminId });
    } catch (error) {
      this.logger.error('Failed to log provider action', { error, providerId, action });
      throw error;
    }
  }

  async updateAPIAccess(providerId: string, hasAccess: boolean): Promise<void> {
    try {
      const query = `
        UPDATE credit_providers 
        SET integration_settings = jsonb_set(
          integration_settings, 
          '{apiAccessEnabled}', 
          $2::jsonb
        ),
        updated_at = $3
        WHERE id = $1
      `;

      await this.db.query(query, [providerId, JSON.stringify(hasAccess), new Date()]);
      
      this.logger.info('Provider API access updated', { providerId, hasAccess });
    } catch (error) {
      this.logger.error('Failed to update API access', { error, providerId });
      throw error;
    }
  }

  async updateLastActivity(providerId: string, timestamp: Date): Promise<void> {
    try {
      const query = `
        UPDATE credit_providers 
        SET performance = jsonb_set(
          performance, 
          '{lastActivity}', 
          $2::jsonb
        )
        WHERE id = $1
      `;

      await this.db.query(query, [providerId, JSON.stringify(timestamp)]);
    } catch (error) {
      this.logger.error('Failed to update last activity', { error, providerId });
      // Don't throw error for activity updates
    }
  }

  async createOnboardingChecklist(providerId: string, steps: string[]): Promise<void> {
    try {
      const query = `
        INSERT INTO provider_onboarding (
          provider_id, steps, completed_steps, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5)
      `;

      await this.db.query(query, [
        providerId,
        JSON.stringify(steps),
        JSON.stringify([]),
        new Date(),
        new Date(),
      ]);
      
      this.logger.info('Onboarding checklist created', { providerId, stepsCount: steps.length });
    } catch (error) {
      this.logger.error('Failed to create onboarding checklist', { error, providerId });
      throw error;
    }
  }

  async updateProviderPerformance(providerId: string, metrics: {
    responseTime?: number;
    decision?: 'approved' | 'rejected';
    disbursed?: boolean;
  }): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get current performance data
      const getCurrentQuery = 'SELECT performance FROM credit_providers WHERE id = $1';
      const currentResult = await client.query(getCurrentQuery, [providerId]);
      
      if (currentResult.rows.length === 0) {
        throw new Error('Provider not found');
      }

      const currentPerformance = currentResult.rows[0].performance;
      
      // Update performance metrics
      if (metrics.responseTime) {
        const totalProcessed = currentPerformance.totalLeadsProcessed || 0;
        const currentAvgTime = currentPerformance.averageResponseTime || 0;
        const newAvgTime = totalProcessed > 0 
          ? ((currentAvgTime * totalProcessed) + metrics.responseTime) / (totalProcessed + 1)
          : metrics.responseTime;
        
        currentPerformance.averageResponseTime = newAvgTime;
        currentPerformance.totalLeadsProcessed = totalProcessed + 1;
      }

      if (metrics.decision) {
        const totalReceived = currentPerformance.totalLeadsReceived || 0;
        const currentApprovalRate = currentPerformance.approvalRate || 0;
        
        if (metrics.decision === 'approved') {
          const totalApproved = Math.floor(totalReceived * (currentApprovalRate / 100)) + 1;
          currentPerformance.approvalRate = totalReceived > 0 ? (totalApproved / totalReceived) * 100 : 100;
        }
      }

      if (metrics.disbursed) {
        const totalReceived = currentPerformance.totalLeadsReceived || 0;
        const currentDisbursementRate = currentPerformance.disbursementRate || 0;
        const totalDisbursed = Math.floor(totalReceived * (currentDisbursementRate / 100)) + 1;
        
        currentPerformance.disbursementRate = totalReceived > 0 ? (totalDisbursed / totalReceived) * 100 : 100;
      }

      currentPerformance.lastActivity = new Date();

      // Update the database
      const updateQuery = `
        UPDATE credit_providers 
        SET performance = $1, updated_at = $2
        WHERE id = $3
      `;

      await client.query(updateQuery, [
        JSON.stringify(currentPerformance),
        new Date(),
        providerId,
      ]);

      await client.query('COMMIT');
      
      this.logger.info('Provider performance updated', { providerId, metrics });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to update provider performance', { error, providerId });
      throw error;
    } finally {
      client.release();
    }
  }

  async incrementLeadCount(providerId: string): Promise<void> {
    try {
      const query = `
        UPDATE credit_providers 
        SET performance = jsonb_set(
          performance, 
          '{totalLeadsReceived}', 
          ((performance->>'totalLeadsReceived')::int + 1)::text::jsonb
        ),
        updated_at = $2
        WHERE id = $1
      `;

      await this.db.query(query, [providerId, new Date()]);
    } catch (error) {
      this.logger.error('Failed to increment lead count', { error, providerId });
      throw error;
    }
  }

  private mapRowToProvider(row: any): CreditProvider {
    return {
      id: row.id,
      registrationData: {
        companyName: row.company_name,
        businessEmail: row.business_email,
        contactPerson: row.contact_person,
        phoneNumber: row.phone_number,
        website: row.website,
        businessAddress: JSON.parse(row.business_address),
        businessRegistration: JSON.parse(row.business_registration),
        licenses: JSON.parse(row.licenses),
        creditCapacity: JSON.parse(row.credit_capacity),
        technicalRequirements: JSON.parse(row.technical_requirements),
        compliance: JSON.parse(row.compliance),
      },
      status: row.status,
      apiCredentials: JSON.parse(row.api_credentials),
      integrationSettings: JSON.parse(row.integration_settings),
      performance: JSON.parse(row.performance),
      billing: JSON.parse(row.billing),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
    };
  }
}