import { HttpClient } from '../core/http-client.js';
import { Loan, LoanSchema, PaginationParams, FilterParams, CaasValidationError } from '../types/index.js';

export class LoanService {
  constructor(private httpClient: HttpClient) {}

  async getLoan(loanId: string): Promise<Loan> {
    const response = await this.httpClient.get<Loan>(`/loans/${loanId}`);
    if (!response.success || !response.data) {
      throw new CaasValidationError('Loan not found', response.error);
    }
    return LoanSchema.parse(response.data);
  }

  async listLoans(pagination: PaginationParams = {}, filters: FilterParams = {}) {
    const response = await this.httpClient.get<any>('/loans', { ...pagination, ...filters });
    if (!response.success || !response.data) {
      throw new CaasValidationError('Failed to fetch loans', response.error);
    }
    return response.data;
  }
}
