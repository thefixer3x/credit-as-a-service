import { Logger } from '@caas/common';
import { Pool } from 'pg';
import { LeadStatusUpdate } from '../types/credit-provider';
import type { ProviderLead } from '../services/lead-distribution-service';

interface LeadDistributionRecord {
  id: string;
  leadId: string;
  providersCount: number;
  distributedAt: Date;
  status: string;
  criteria: Record<string, unknown>;
}

interface LeadStatistics {
  totalReceived: number;
  totalProcessed: number;
  totalApproved: number;
  totalRejected: number;
  totalPending: number;
  averageProcessingTime: number;
  averageApprovedAmount: number;
  totalDisbursedAmount: number;
  totalRevenue: number;
}

const providerLeads = new Map<string, ProviderLead>();
const distributions = new Map<string, LeadDistributionRecord>();
const statusUpdates: LeadStatusUpdate[] = [];

export class LeadRepository {
  constructor(
    private logger: Logger,
    private db: Pool
  ) {}

  async findById(id: string): Promise<ProviderLead | null> {
    return [...providerLeads.values()].find(lead => lead.id === id || lead.leadId === id) ?? null;
  }

  async create(data: ProviderLead): Promise<ProviderLead> {
    await this.createProviderLead(data);
    return data;
  }

  async update(id: string, data: Partial<ProviderLead>): Promise<ProviderLead> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Lead not found');
    }

    const updated = { ...existing, ...data };
    providerLeads.set(this.providerLeadKey(updated.providerId, updated.leadId), updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    for (const [key, lead] of providerLeads.entries()) {
      if (lead.id === id || lead.leadId === id) {
        providerLeads.delete(key);
      }
    }
  }

  async createDistribution(distribution: LeadDistributionRecord): Promise<LeadDistributionRecord> {
    distributions.set(distribution.id, distribution);

    await this.safeQuery(
      `INSERT INTO lead_distributions (id, lead_id, providers_count, distributed_at, status, criteria, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         providers_count = EXCLUDED.providers_count,
         status = EXCLUDED.status,
         criteria = EXCLUDED.criteria`,
      [
        distribution.id,
        distribution.leadId,
        distribution.providersCount,
        distribution.distributedAt,
        distribution.status,
        JSON.stringify(distribution.criteria),
      ],
      'create lead distribution'
    );

    return distribution;
  }

  async getLeadDistribution(leadId: string): Promise<LeadDistributionRecord | null> {
    const cached = [...distributions.values()].find(distribution => distribution.leadId === leadId);
    if (cached) return cached;

    const result = await this.safeQuery(
      'SELECT * FROM lead_distributions WHERE lead_id = $1 ORDER BY distributed_at DESC LIMIT 1',
      [leadId],
      'get lead distribution'
    );

    if (!result?.rows.length) return null;
    return this.mapDistributionRow(result.rows[0]);
  }

  async createProviderLead(providerLead: ProviderLead): Promise<void> {
    providerLeads.set(this.providerLeadKey(providerLead.providerId, providerLead.leadId), providerLead);

    await this.safeQuery(
      `INSERT INTO provider_leads (
        id, lead_id, provider_id, lead_data, status, distributed_at, responded_at,
        decision, matching_score, priority, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (provider_id, lead_id) DO UPDATE SET
        lead_data = EXCLUDED.lead_data,
        status = EXCLUDED.status,
        decision = EXCLUDED.decision,
        matching_score = EXCLUDED.matching_score,
        priority = EXCLUDED.priority,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()`,
      [
        providerLead.id,
        providerLead.leadId,
        providerLead.providerId,
        JSON.stringify(providerLead.leadData),
        providerLead.status,
        providerLead.distributedAt,
        providerLead.respondedAt ?? null,
        providerLead.decision ? JSON.stringify(providerLead.decision) : null,
        providerLead.matchingScore,
        providerLead.priority,
        providerLead.expiresAt,
      ],
      'create provider lead'
    );
  }

  async getProviderLead(providerId: string, leadId: string): Promise<ProviderLead | null> {
    const cached = providerLeads.get(this.providerLeadKey(providerId, leadId));
    if (cached) return cached;

    const result = await this.safeQuery(
      'SELECT * FROM provider_leads WHERE provider_id = $1 AND lead_id = $2 LIMIT 1',
      [providerId, leadId],
      'get provider lead'
    );

    if (!result?.rows.length) return null;
    return this.mapProviderLeadRow(result.rows[0]);
  }

  async getProviderLeads(
    providerId: string,
    filters: {
      status?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ leads: ProviderLead[]; total: number }> {
    const cached = [...providerLeads.values()].filter(lead => {
      if (lead.providerId !== providerId) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.startDate && lead.distributedAt < filters.startDate) return false;
      if (filters.endDate && lead.distributedAt > filters.endDate) return false;
      return true;
    });

    if (cached.length > 0) {
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 50;
      return { leads: cached.slice(offset, offset + limit), total: cached.length };
    }

    const conditions = ['provider_id = $1'];
    const values: unknown[] = [providerId];
    let index = 2;

    if (filters.status) {
      conditions.push(`status = $${index++}`);
      values.push(filters.status);
    }

    if (filters.startDate) {
      conditions.push(`distributed_at >= $${index++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`distributed_at <= $${index++}`);
      values.push(filters.endDate);
    }

    const countResult = await this.safeQuery(
      `SELECT COUNT(*)::int AS total FROM provider_leads WHERE ${conditions.join(' AND ')}`,
      values,
      'count provider leads'
    );

    values.push(filters.limit ?? 50, filters.offset ?? 0);

    const result = await this.safeQuery(
      `SELECT * FROM provider_leads
       WHERE ${conditions.join(' AND ')}
       ORDER BY distributed_at DESC
       LIMIT $${index++} OFFSET $${index++}`,
      values,
      'get provider leads'
    );

    return {
      leads: result?.rows.map(row => this.mapProviderLeadRow(row)) ?? [],
      total: countResult?.rows[0]?.total ?? 0,
    };
  }

  async updateProviderLead(
    providerId: string,
    leadId: string,
    updates: Partial<ProviderLead>
  ): Promise<ProviderLead | null> {
    const existing = await this.getProviderLead(providerId, leadId);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    providerLeads.set(this.providerLeadKey(providerId, leadId), updated);

    await this.safeQuery(
      `UPDATE provider_leads
       SET status = COALESCE($3, status),
           responded_at = COALESCE($4, responded_at),
           decision = COALESCE($5, decision),
           updated_at = NOW()
       WHERE provider_id = $1 AND lead_id = $2`,
      [
        providerId,
        leadId,
        updates.status ?? null,
        updates.respondedAt ?? null,
        updates.decision ? JSON.stringify(updates.decision) : null,
      ],
      'update provider lead'
    );

    return updated;
  }

  async createStatusUpdate(update: LeadStatusUpdate): Promise<void> {
    statusUpdates.push(update);

    await this.safeQuery(
      `INSERT INTO lead_status_updates (lead_id, provider_id, status, status_message, metadata, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        update.leadId,
        update.providerId,
        update.status,
        update.statusMessage,
        JSON.stringify(update.metadata ?? {}),
        update.updatedAt,
      ],
      'create lead status update'
    );
  }

  async getDistributionProviderLeads(distributionId: string): Promise<ProviderLead[]> {
    const distribution = distributions.get(distributionId);
    if (distribution) {
      return [...providerLeads.values()].filter(lead => lead.leadId === distribution.leadId);
    }

    const result = await this.safeQuery(
      `SELECT pl.*
       FROM provider_leads pl
       JOIN lead_distributions ld ON ld.lead_id = pl.lead_id
       WHERE ld.id = $1
       ORDER BY pl.distributed_at DESC`,
      [distributionId],
      'get distribution provider leads'
    );

    return result?.rows.map(row => this.mapProviderLeadRow(row)) ?? [];
  }

  async getLeadStatistics(
    providerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<LeadStatistics> {
    const leads = [...providerLeads.values()].filter(lead =>
      lead.providerId === providerId &&
      lead.distributedAt >= startDate &&
      lead.distributedAt <= endDate
    );

    if (leads.length > 0) {
      return this.calculateLeadStatistics(leads);
    }

    const result = await this.safeQuery(
      `SELECT
         COUNT(*)::int AS total_received,
         COUNT(*) FILTER (WHERE status = 'responded')::int AS total_processed,
         COUNT(*) FILTER (WHERE decision->>'decision' = 'approved')::int AS total_approved,
         COUNT(*) FILTER (WHERE decision->>'decision' = 'rejected')::int AS total_rejected,
         COUNT(*) FILTER (WHERE status IN ('sent', 'received', 'reviewing'))::int AS total_pending,
         COALESCE(AVG(EXTRACT(EPOCH FROM (responded_at - distributed_at)) / 3600), 0)::float AS average_processing_time,
         COALESCE(AVG((decision->>'approvedAmount')::numeric) FILTER (WHERE decision->>'decision' = 'approved'), 0)::float AS average_approved_amount,
         COALESCE(SUM((decision->>'approvedAmount')::numeric) FILTER (WHERE decision->>'decision' = 'approved'), 0)::float AS total_disbursed_amount
       FROM provider_leads
       WHERE provider_id = $1 AND distributed_at BETWEEN $2 AND $3`,
      [providerId, startDate, endDate],
      'get lead statistics'
    );

    const row = result?.rows[0];
    return {
      totalReceived: row?.total_received ?? 0,
      totalProcessed: row?.total_processed ?? 0,
      totalApproved: row?.total_approved ?? 0,
      totalRejected: row?.total_rejected ?? 0,
      totalPending: row?.total_pending ?? 0,
      averageProcessingTime: Number(row?.average_processing_time ?? 0),
      averageApprovedAmount: Number(row?.average_approved_amount ?? 0),
      totalDisbursedAmount: Number(row?.total_disbursed_amount ?? 0),
      totalRevenue: Number(row?.total_disbursed_amount ?? 0) * 0.085,
    };
  }

  private calculateLeadStatistics(leads: ProviderLead[]): LeadStatistics {
    const approved = leads.filter(lead => lead.decision?.decision === 'approved');
    const rejected = leads.filter(lead => lead.decision?.decision === 'rejected');
    const processed = leads.filter(lead => lead.status === 'responded');
    const pending = leads.filter(lead => ['sent', 'received', 'reviewing'].includes(lead.status));
    const responseTimes = leads
      .filter(lead => lead.respondedAt)
      .map(lead => (lead.respondedAt!.getTime() - lead.distributedAt.getTime()) / 3_600_000);
    const approvedAmounts = approved.map(lead => lead.decision?.approvedAmount ?? 0);
    const totalDisbursedAmount = approvedAmounts.reduce((sum, amount) => sum + amount, 0);

    return {
      totalReceived: leads.length,
      totalProcessed: processed.length,
      totalApproved: approved.length,
      totalRejected: rejected.length,
      totalPending: pending.length,
      averageProcessingTime: responseTimes.length
        ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
        : 0,
      averageApprovedAmount: approvedAmounts.length
        ? totalDisbursedAmount / approvedAmounts.length
        : 0,
      totalDisbursedAmount,
      totalRevenue: totalDisbursedAmount * 0.085,
    };
  }

  private mapProviderLeadRow(row: any): ProviderLead {
    return {
      id: row.id,
      leadId: row.lead_id,
      providerId: row.provider_id,
      leadData: this.parseJson(row.lead_data, {}),
      status: row.status as ProviderLead['status'],
      distributedAt: new Date(row.distributed_at),
      respondedAt: row.responded_at ? new Date(row.responded_at) : undefined,
      decision: row.decision ? this.parseJson(row.decision, undefined) : undefined,
      matchingScore: Number(row.matching_score ?? 0),
      priority: row.priority as ProviderLead['priority'],
      expiresAt: new Date(row.expires_at),
    };
  }

  private mapDistributionRow(row: any): LeadDistributionRecord {
    return {
      id: row.id,
      leadId: row.lead_id,
      providersCount: Number(row.providers_count ?? 0),
      distributedAt: new Date(row.distributed_at),
      status: row.status,
      criteria: this.parseJson(row.criteria, {}),
    };
  }

  private providerLeadKey(providerId: string, leadId: string): string {
    return `${providerId}:${leadId}`;
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value as T;

    try {
      return JSON.parse(String(value)) as T;
    } catch {
      return fallback;
    }
  }

  private async safeQuery(query: string, values: unknown[], operation: string) {
    try {
      return await this.db.query(query, values);
    } catch (error) {
      this.logger.warn(`Database ${operation} unavailable; using in-memory fallback`, {
        error: error instanceof Error ? error.message : 'Unknown database error',
      });
      return null;
    }
  }
}
