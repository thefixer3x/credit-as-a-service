import { z } from 'zod';

// Credit Provider Registration Schema
export const CreditProviderRegistrationSchema = z.object({
  companyName: z.string().min(2).max(100),
  businessEmail: z.string().email(),
  contactPerson: z.string().min(2).max(50),
  phoneNumber: z.string().min(10).max(20),
  website: z.string().url().optional(),
  businessAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    country: z.string(),
    postalCode: z.string(),
  }),
  businessRegistration: z.object({
    registrationNumber: z.string(),
    registrationCountry: z.string(),
    registrationDate: z.string(),
    businessType: z.enum(['bank', 'microfinance', 'fintech', 'nbfi', 'cooperative', 'other']),
  }),
  licenses: z.array(z.object({
    licenseType: z.string(),
    licenseNumber: z.string(),
    issuingAuthority: z.string(),
    expiryDate: z.string(),
    document: z.string().optional(), // Base64 encoded document
  })).min(1),
  creditCapacity: z.object({
    minimumLoanAmount: z.number().positive(),
    maximumLoanAmount: z.number().positive(),
    interestRateRange: z.object({
      minimum: z.number().min(0).max(100),
      maximum: z.number().min(0).max(100),
    }),
    tenureRange: z.object({
      minimumDays: z.number().positive(),
      maximumDays: z.number().positive(),
    }),
    supportedCurrencies: z.array(z.string()).min(1),
    geographicCoverage: z.array(z.string()).min(1),
  }),
  technicalRequirements: z.object({
    webhookUrl: z.string().url(),
    apiEndpoints: z.object({
      baseUrl: z.string().url(),
      loanApplicationEndpoint: z.string().optional(),
      loanStatusEndpoint: z.string().optional(),
      disbursementEndpoint: z.string().optional(),
      repaymentEndpoint: z.string().optional(),
    }),
    authMethod: z.enum(['bearer_token', 'api_key', 'oauth2', 'basic_auth']),
    ipWhitelist: z.array(z.string()).optional(),
    rateLimits: z.object({
      requestsPerMinute: z.number().positive(),
      requestsPerHour: z.number().positive(),
      requestsPerDay: z.number().positive(),
    }).optional(),
  }),
  compliance: z.object({
    kycRequirements: z.array(z.string()).min(1),
    dataProtectionCompliance: z.array(z.enum(['GDPR', 'CCPA', 'PDPL', 'NDPR', 'other'])),
    auditCertifications: z.array(z.string()).optional(),
    regulatoryApprovals: z.array(z.string()).min(1),
  }),
});

export type CreditProviderRegistration = z.infer<typeof CreditProviderRegistrationSchema>;

// Credit Provider Profile
export interface CreditProvider {
  id: string;
  registrationData: CreditProviderRegistration;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'suspended' | 'active' | 'inactive';
  apiCredentials: {
    providerId: string;
    apiKey: string;
    webhookSecret: string;
    lastRotated: Date;
  };
  integrationSettings: {
    enabledFeatures: string[];
    leadCategories: string[];
    autoApprovalRules: Record<string, any>;
    customFields: Record<string, any>;
  };
  performance: {
    totalLeadsReceived: number;
    totalLeadsProcessed: number;
    averageResponseTime: number;
    approvalRate: number;
    disbursementRate: number;
    lastActivity: Date;
  };
  billing: {
    plan: 'basic' | 'standard' | 'premium' | 'enterprise';
    costPerLead: number;
    monthlyFee: number;
    lastBillingDate: Date;
    nextBillingDate: Date;
    paymentStatus: 'current' | 'overdue' | 'suspended';
  };
  createdAt: Date;
  updatedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

// Lead/Application Data for Credit Providers
export const LeadDataSchema = z.object({
  leadId: z.string(),
  applicant: z.object({
    personalInfo: z.object({
      firstName: z.string(),
      lastName: z.string(),
      dateOfBirth: z.string(),
      gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
      nationality: z.string(),
      phoneNumber: z.string(),
      email: z.string().email(),
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        country: z.string(),
        postalCode: z.string(),
      }),
    }),
    employmentInfo: z.object({
      employmentStatus: z.enum(['employed', 'self_employed', 'unemployed', 'retired', 'student']),
      companyName: z.string().optional(),
      jobTitle: z.string().optional(),
      monthlyIncome: z.number().positive(),
      employmentDuration: z.number().optional(), // in months
      previousEmployment: z.array(z.object({
        companyName: z.string(),
        jobTitle: z.string(),
        duration: z.number(),
        monthlyIncome: z.number(),
      })).optional(),
    }),
    financialInfo: z.object({
      bankAccount: z.object({
        accountNumber: z.string(),
        bankName: z.string(),
        accountType: z.enum(['savings', 'current', 'salary']),
        bankCode: z.string().optional(),
      }),
      existingLoans: z.array(z.object({
        lenderName: z.string(),
        loanAmount: z.number(),
        outstandingAmount: z.number(),
        monthlyPayment: z.number(),
        loanType: z.string(),
      })).optional(),
      creditCards: z.array(z.object({
        bankName: z.string(),
        creditLimit: z.number(),
        outstandingAmount: z.number(),
        monthlyPayment: z.number(),
      })).optional(),
      monthlyExpenses: z.number().positive(),
      assets: z.array(z.object({
        type: z.string(),
        value: z.number(),
        description: z.string(),
      })).optional(),
    }),
    documents: z.array(z.object({
      type: z.enum(['identity', 'income_proof', 'bank_statement', 'employment_letter', 'utility_bill', 'other']),
      fileName: z.string(),
      fileUrl: z.string(),
      uploadedAt: z.string(),
      verified: z.boolean(),
    })),
  }),
  loanApplication: z.object({
    requestedAmount: z.number().positive(),
    purpose: z.string(),
    tenure: z.number().positive(), // in days
    preferredInterestRate: z.number().positive().optional(),
    collateral: z.object({
      type: z.string(),
      value: z.number(),
      description: z.string(),
    }).optional(),
  }),
  creditAssessment: z.object({
    creditScore: z.number().min(300).max(850),
    riskRating: z.enum(['low', 'medium', 'high']),
    debtToIncomeRatio: z.number(),
    paymentHistory: z.object({
      onTimePayments: z.number(),
      latePayments: z.number(),
      missedPayments: z.number(),
      defaultedLoans: z.number(),
    }),
    recommendations: z.object({
      recommendedAmount: z.number().positive(),
      recommendedTenure: z.number().positive(),
      recommendedInterestRate: z.number().positive(),
      conditions: z.array(z.string()).optional(),
    }),
  }),
  platformData: z.object({
    applicationId: z.string(),
    submittedAt: z.string(),
    lastUpdated: z.string(),
    source: z.string(),
    referrer: z.string().optional(),
    deviceInfo: z.object({
      userAgent: z.string(),
      ipAddress: z.string(),
      deviceType: z.enum(['mobile', 'desktop', 'tablet']),
    }).optional(),
  }),
});

export type LeadData = z.infer<typeof LeadDataSchema>;

// Provider Response Schemas
export const ProviderLoanDecisionSchema = z.object({
  leadId: z.string(),
  providerId: z.string(),
  decision: z.enum(['approved', 'rejected', 'pending', 'needs_more_info']),
  approvedAmount: z.number().positive().optional(),
  interestRate: z.number().positive().optional(),
  tenure: z.number().positive().optional(),
  conditions: z.array(z.string()).optional(),
  rejectionReason: z.string().optional(),
  additionalRequirements: z.array(z.object({
    type: z.string(),
    description: z.string(),
    required: z.boolean(),
  })).optional(),
  expiresAt: z.string().optional(),
  customData: z.record(z.any()).optional(),
  processedAt: z.string(),
});

export type ProviderLoanDecision = z.infer<typeof ProviderLoanDecisionSchema>;

// Lead Status Updates
export interface LeadStatusUpdate {
  leadId: string;
  providerId: string;
  status: 'received' | 'reviewing' | 'approved' | 'rejected' | 'disbursed' | 'completed' | 'defaulted';
  statusMessage: string;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// Provider Analytics
export interface ProviderAnalytics {
  providerId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  metrics: {
    leadsReceived: number;
    leadsProcessed: number;
    leadsApproved: number;
    leadsRejected: number;
    averageProcessingTime: number; // in hours
    averageApprovedAmount: number;
    totalDisbursedAmount: number;
    conversionRate: number; // percentage
    customerSatisfactionScore: number;
  };
  performance: {
    responseTimeMetrics: {
      average: number;
      median: number;
      p95: number;
      p99: number;
    };
    uptimePercentage: number;
    errorRate: number;
    webhookDeliveryRate: number;
  };
  financialMetrics: {
    totalRevenue: number;
    totalCost: number;
    profitMargin: number;
    costPerLead: number;
    revenuePerLead: number;
  };
}

// Webhook Events for Credit Providers
export interface ProviderWebhookEvent {
  eventId: string;
  eventType: 'lead_received' | 'lead_updated' | 'decision_required' | 'payment_received' | 'loan_defaulted';
  providerId: string;
  timestamp: Date;
  data: LeadData | LeadStatusUpdate | ProviderLoanDecision;
  retryCount: number;
  signature: string;
}

// API Plugin Configuration
export interface ProviderAPIPlugin {
  providerId: string;
  pluginName: string;
  version: string;
  configuration: {
    endpoints: Record<string, string>;
    authentication: Record<string, any>;
    mappings: Record<string, any>;
    transformations: Array<{
      field: string;
      transformation: string;
      parameters: Record<string, any>;
    }>;
  };
  isActive: boolean;
  lastSync: Date;
  syncFrequency: 'real_time' | 'hourly' | 'daily' | 'weekly';
  errorHandling: {
    retryAttempts: number;
    backoffStrategy: 'linear' | 'exponential';
    fallbackAction: 'queue' | 'discard' | 'manual_review';
  };
}

// Dashboard Configuration
export interface ProviderDashboardConfig {
  providerId: string;
  dashboardSettings: {
    theme: 'light' | 'dark' | 'auto';
    defaultView: 'overview' | 'leads' | 'analytics' | 'settings';
    refreshInterval: number; // in seconds
    notifications: {
      email: boolean;
      sms: boolean;
      inApp: boolean;
      webhook: boolean;
    };
  };
  widgets: Array<{
    id: string;
    type: 'chart' | 'table' | 'metric' | 'feed';
    position: { x: number; y: number; width: number; height: number };
    configuration: Record<string, any>;
    isVisible: boolean;
  }>;
  customFilters: Array<{
    name: string;
    field: string;
    operator: string;
    value: any;
    isActive: boolean;
  }>;
}