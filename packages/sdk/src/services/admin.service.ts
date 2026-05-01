import { HttpClient } from '../core/http-client.js';
import { CaasValidationError } from '../types/index.js';

export class AdminService {
  constructor(private httpClient: HttpClient) {}

  async getMetrics(): Promise<Record<string, unknown>> {
    const response = await this.httpClient.get<Record<string, unknown>>('/admin/metrics');
    if (!response.success || !response.data) {
      throw new CaasValidationError('Failed to fetch admin metrics', response.error);
    }
    return response.data;
  }

  async getAuditLogs(params: Record<string, unknown> = {}) {
    const response = await this.httpClient.get<any>('/admin/audit-logs', params);
    if (!response.success || !response.data) {
      throw new CaasValidationError('Failed to fetch audit logs', response.error);
    }
    return response.data;
  }
}
