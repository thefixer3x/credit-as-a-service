import { HttpClient } from '../core/http-client.js';
import { Payment, PaymentSchema, PaginationParams, FilterParams, CaasValidationError } from '../types/index.js';

export class PaymentService {
  constructor(private httpClient: HttpClient) {}

  async createPayment(data: Record<string, unknown>): Promise<Payment> {
    const response = await this.httpClient.post<Payment>('/payments', data);
    if (!response.success || !response.data) {
      throw new CaasValidationError('Failed to create payment', response.error);
    }
    return PaymentSchema.parse(response.data);
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const response = await this.httpClient.get<Payment>(`/payments/${paymentId}`);
    if (!response.success || !response.data) {
      throw new CaasValidationError('Payment not found', response.error);
    }
    return PaymentSchema.parse(response.data);
  }

  async listPayments(pagination: PaginationParams = {}, filters: FilterParams = {}) {
    const response = await this.httpClient.get<any>('/payments', { ...pagination, ...filters });
    if (!response.success || !response.data) {
      throw new CaasValidationError('Failed to fetch payments', response.error);
    }
    return response.data;
  }
}
