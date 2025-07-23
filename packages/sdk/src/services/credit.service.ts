import { HttpClient } from '../core/http-client.js';
import { 
  CreditApplication, 
  CreditApplicationSchema,
  Loan,
  LoanSchema,
  ApiResponse, 
  PaginationParams, 
  FilterParams,
  CaasValidationError 
} from '../types/index.js';

export interface CreateCreditApplicationRequest {
  userId: string;
  requestedAmount: number;
  purpose: string;
  termMonths?: number;
  employmentInfo?: {
    status: 'employed' | 'self_employed' | 'unemployed';
    employer?: string;
    annualIncome?: number;
    yearsEmployed?: number;
  };
  financialInfo?: {
    monthlyIncome?: number;
    monthlyExpenses?: number;
    assets?: number;
    debts?: number;
  };
}

export interface UpdateCreditApplicationRequest {
  requestedAmount?: number;
  purpose?: string;
  termMonths?: number;
  employmentInfo?: any;
  financialInfo?: any;
}

export interface CreditDecisionRequest {
  applicationId: string;
  decision: 'approve' | 'reject';
  approvedAmount?: number;
  interestRate?: number;
  termMonths?: number;
  conditions?: string[];
  reason?: string;
}

export interface ApplicationListResponse {
  applications: CreditApplication[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface LoanListResponse {
  loans: Loan[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class CreditService {
  constructor(private httpClient: HttpClient) {}

  /**
   * Create a new credit application
   */
  async createApplication(applicationData: CreateCreditApplicationRequest): Promise<CreditApplication> {
    if (!applicationData.userId || !applicationData.requestedAmount || !applicationData.purpose) {
      throw new CaasValidationError('User ID, requested amount, and purpose are required');
    }

    if (applicationData.requestedAmount <= 0) {
      throw new CaasValidationError('Requested amount must be positive');
    }

    try {
      const response = await this.httpClient.post<CreditApplication>('/credit/applications', applicationData);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to create credit application', response.error);
      }

      return CreditApplicationSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to create credit application', error);
    }
  }

  /**
   * Get credit application by ID
   */
  async getApplicationById(applicationId: string): Promise<CreditApplication> {
    if (!applicationId) {
      throw new CaasValidationError('Application ID is required');
    }

    try {
      const response = await this.httpClient.get<CreditApplication>(`/credit/applications/${applicationId}`);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Application not found', response.error);
      }

      return CreditApplicationSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch credit application', error);
    }
  }

  /**
   * Update credit application
   */
  async updateApplication(
    applicationId: string, 
    updates: UpdateCreditApplicationRequest
  ): Promise<CreditApplication> {
    if (!applicationId) {
      throw new CaasValidationError('Application ID is required');
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new CaasValidationError('Update data is required');
    }

    if (updates.requestedAmount !== undefined && updates.requestedAmount <= 0) {
      throw new CaasValidationError('Requested amount must be positive');
    }

    try {
      const response = await this.httpClient.patch<CreditApplication>(
        `/credit/applications/${applicationId}`, 
        updates
      );
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to update application', response.error);
      }

      return CreditApplicationSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to update credit application', error);
    }
  }

  /**
   * List credit applications with pagination and filtering
   */
  async listApplications(
    pagination: PaginationParams = {},
    filters: FilterParams = {}
  ): Promise<ApplicationListResponse> {
    const params = {
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc',
      ...filters,
    };

    try {
      const response = await this.httpClient.get<ApplicationListResponse>('/credit/applications', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch applications', response.error);
      }

      const validatedApplications = response.data.applications.map(app => 
        CreditApplicationSchema.parse(app)
      );
      
      return {
        ...response.data,
        applications: validatedApplications,
      };
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch credit applications', error);
    }
  }

  /**
   * Get applications by user ID
   */
  async getApplicationsByUserId(
    userId: string,
    pagination: PaginationParams = {}
  ): Promise<ApplicationListResponse> {
    if (!userId) {
      throw new CaasValidationError('User ID is required');
    }

    const params = {
      userId,
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc',
    };

    try {
      const response = await this.httpClient.get<ApplicationListResponse>('/credit/applications', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch user applications', response.error);
      }

      const validatedApplications = response.data.applications.map(app => 
        CreditApplicationSchema.parse(app)
      );
      
      return {
        ...response.data,
        applications: validatedApplications,
      };
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch user applications', error);
    }
  }

  /**
   * Submit application for review
   */
  async submitApplication(applicationId: string): Promise<CreditApplication> {
    if (!applicationId) {
      throw new CaasValidationError('Application ID is required');
    }

    try {
      const response = await this.httpClient.post<CreditApplication>(
        `/credit/applications/${applicationId}/submit`
      );
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to submit application', response.error);
      }

      return CreditApplicationSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to submit application', error);
    }
  }

  /**
   * Make credit decision (approve/reject)
   */
  async makeCreditDecision(decision: CreditDecisionRequest): Promise<CreditApplication> {
    if (!decision.applicationId || !decision.decision) {
      throw new CaasValidationError('Application ID and decision are required');
    }

    if (decision.decision === 'approve') {
      if (!decision.approvedAmount || !decision.interestRate || !decision.termMonths) {
        throw new CaasValidationError('Approved amount, interest rate, and term are required for approval');
      }

      if (decision.approvedAmount <= 0) {
        throw new CaasValidationError('Approved amount must be positive');
      }

      if (decision.interestRate < 0 || decision.interestRate > 100) {
        throw new CaasValidationError('Interest rate must be between 0 and 100');
      }

      if (decision.termMonths <= 0) {
        throw new CaasValidationError('Term months must be positive');
      }
    }

    try {
      const response = await this.httpClient.post<CreditApplication>(
        '/credit/decisions', 
        decision
      );
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to process credit decision', response.error);
      }

      return CreditApplicationSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to process credit decision', error);
    }
  }

  /**
   * Get credit application analytics
   */
  async getApplicationAnalytics(dateRange?: { from: string; to: string }): Promise<{
    totalApplications: number;
    approvedApplications: number;
    rejectedApplications: number;
    pendingApplications: number;
    averageRequestedAmount: number;
    averageApprovedAmount: number;
    approvalRate: number;
    byStatus: Record<string, number>;
    byMonth: Array<{ month: string; count: number; approved: number; rejected: number }>;
  }> {
    const params = dateRange ? { 
      dateFrom: dateRange.from, 
      dateTo: dateRange.to 
    } : {};

    try {
      const response = await this.httpClient.get<any>('/credit/analytics/applications', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch application analytics', response.error);
      }

      return response.data;
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch application analytics', error);
    }
  }

  /**
   * Get loan by ID
   */
  async getLoanById(loanId: string): Promise<Loan> {
    if (!loanId) {
      throw new CaasValidationError('Loan ID is required');
    }

    try {
      const response = await this.httpClient.get<Loan>(`/credit/loans/${loanId}`);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Loan not found', response.error);
      }

      return LoanSchema.parse(response.data);
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch loan', error);
    }
  }

  /**
   * List loans with pagination and filtering
   */
  async listLoans(
    pagination: PaginationParams = {},
    filters: FilterParams = {}
  ): Promise<LoanListResponse> {
    const params = {
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc',
      ...filters,
    };

    try {
      const response = await this.httpClient.get<LoanListResponse>('/credit/loans', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch loans', response.error);
      }

      const validatedLoans = response.data.loans.map(loan => LoanSchema.parse(loan));
      
      return {
        ...response.data,
        loans: validatedLoans,
      };
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch loans', error);
    }
  }

  /**
   * Get loans by user ID
   */
  async getLoansByUserId(
    userId: string,
    pagination: PaginationParams = {}
  ): Promise<LoanListResponse> {
    if (!userId) {
      throw new CaasValidationError('User ID is required');
    }

    const params = {
      userId,
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      sortBy: pagination.sortBy || 'createdAt',
      sortOrder: pagination.sortOrder || 'desc',
    };

    try {
      const response = await this.httpClient.get<LoanListResponse>('/credit/loans', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to fetch user loans', response.error);
      }

      const validatedLoans = response.data.loans.map(loan => LoanSchema.parse(loan));
      
      return {
        ...response.data,
        loans: validatedLoans,
      };
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to fetch user loans', error);
    }
  }

  /**
   * Calculate loan quote
   */
  async calculateLoanQuote(params: {
    amount: number;
    termMonths: number;
    creditScore?: number;
    userId?: string;
  }): Promise<{
    requestedAmount: number;
    termMonths: number;
    estimatedInterestRate: number;
    monthlyPayment: number;
    totalInterest: number;
    totalPayment: number;
    fees: Record<string, number>;
    eligibility: {
      eligible: boolean;
      reasons?: string[];
      maxAmount?: number;
      minAmount?: number;
    };
  }> {
    if (!params.amount || !params.termMonths) {
      throw new CaasValidationError('Amount and term are required');
    }

    if (params.amount <= 0) {
      throw new CaasValidationError('Amount must be positive');
    }

    if (params.termMonths <= 0) {
      throw new CaasValidationError('Term must be positive');
    }

    try {
      const response = await this.httpClient.post<any>('/credit/quote', params);
      
      if (!response.success || !response.data) {
        throw new CaasValidationError('Failed to calculate loan quote', response.error);
      }

      return response.data;
    } catch (error) {
      if (error instanceof CaasValidationError) {
        throw error;
      }
      throw new CaasValidationError('Failed to calculate loan quote', error);
    }
  }
}