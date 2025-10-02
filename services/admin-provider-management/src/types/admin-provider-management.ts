import { z } from 'zod';

// Admin Provider Onboarding Types
export const AdminProviderOnboardingSchema = z.object({
  companyName: z.string().min(2).max(100),
  businessEmail: z.string().email(),
  contactPerson: z.string().min(2).max(100),
  phoneNumber: z.string().min(10).max(20),
  website: z.string().url().optional(),
  businessAddress: z.object({
    street: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    country: z.string().min(2).max(100),
    postalCode: z.string().min(3).max(20)
  }),
  businessRegistration: z.object({
    registrationNumber: z.string().min(5).max(50),
    businessType: z.enum(['bank', 'credit_union', 'fintech', 'lending_company', 'microfinance']),
    registrationCountry: z.string().min(2).max(3),
    registrationDate: z.string().datetime()
  }),
  licenses: z.array(z.object({
    licenseType: z.string().min(2).max(100),
    licenseNumber: z.string().min(5).max(50),
    issuingAuthority: z.string().min(2).max(100),
    issueDate: z.string().datetime(),
    expiryDate: z.string().datetime(),
    status: z.enum(['active', 'expired', 'suspended'])
  })),
  creditCapacity: z.object({
    minimumLoanAmount: z.number().positive(),
    maximumLoanAmount: z.number().positive(),
    monthlyCapacity: z.number().positive(),
    interestRateRange: z.object({
      minimum: z.number().min(0).max(100),
      maximum: z.number().min(0).max(100)
    }),
    geographicCoverage: z.array(z.string()),
    supportedCurrencies: z.array(z.string()),
    loanTypes: z.array(z.enum(['personal', 'business', 'mortgage', 'auto', 'education']))
  }),
  integrationService: z.object({
    needsTechnicalSupport: z.boolean(),
    integrationComplexity: z.enum(['simple', 'moderate', 'complex']),
    timelineWeeks: z.number().min(1).max(52),
    dedicatedSupport: z.boolean(),
    apiReadiness: z.enum(['ready', 'partial', 'none'])
  }),
  revenueModel: z.object({
    feeStructure: z.enum(['per_lead', 'percentage', 'hybrid']),
    feePercentage: z.number().min(0).max(50).optional(),
    feePerLead: z.number().min(0).optional(),
    minimumFee: z.number().min(0).optional(),
    paymentTerms: z.enum(['immediate', 'weekly', 'monthly']),
    customTerms: z.string().optional()
  }),
  adminNotes: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignedAdmin: z.string().uuid()
});

export type AdminProviderOnboarding = z.infer<typeof AdminProviderOnboardingSchema>;

// Integration Service Configuration
export const IntegrationServiceConfigSchema = z.object({
  providerId: z.string().uuid(),
  serviceLevel: z.enum(['basic', 'standard', 'premium']),
  services: z.object({
    apiDevelopment: z.boolean(),
    webhookSetup: z.boolean(),
    dataMapping: z.boolean(),
    testingSupport: z.boolean(),
    goLiveSupport: z.boolean(),
    ongoingMaintenance: z.boolean(),
    customizations: z.array(z.string())
  }),
  timeline: z.object({
    estimatedWeeks: z.number().min(1).max(52),
    milestones: z.array(z.object({
      name: z.string(),
      description: z.string(),
      estimatedDate: z.string().datetime(),
      status: z.enum(['pending', 'in_progress', 'completed', 'blocked'])
    }))
  }),
  costs: z.object({
    setupFee: z.number().min(0),
    monthlyFee: z.number().min(0),
    customizationFee: z.number().min(0),
    totalEstimate: z.number().min(0)
  }),
  assignedEngineer: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'in_progress', 'completed', 'cancelled']),
  contractSigned: z.boolean().default(false)
});

export type IntegrationServiceConfig = z.infer<typeof IntegrationServiceConfigSchema>;

// Margin Configuration
export const MarginConfigurationSchema = z.object({
  providerId: z.string().uuid(),
  marginStructure: z.object({
    type: z.enum(['fixed_percentage', 'tiered', 'performance_based', 'custom']),
    basePercentage: z.number().min(0).max(50),
    tierStructure: z.array(z.object({
      minVolume: z.number().min(0),
      maxVolume: z.number().min(0),
      percentage: z.number().min(0).max(50)
    })).optional(),
    performanceMultipliers: z.object({
      highPerformance: z.number().min(1).max(3), // 1.0x to 3.0x
      standardPerformance: z.number().min(0.5).max(1.5),
      lowPerformance: z.number().min(0.1).max(1)
    }).optional()
  }),
  minimumMargin: z.number().min(0),
  maximumMargin: z.number().min(0),
  adjustmentRules: z.array(z.object({
    condition: z.string(),
    adjustment: z.number(),
    type: z.enum(['add', 'multiply', 'set'])
  })),
  reviewFrequency: z.enum(['monthly', 'quarterly', 'annually']),
  lastReviewed: z.string().datetime().optional(),
  nextReview: z.string().datetime(),
  approvedBy: z.string().uuid(),
  effectiveDate: z.string().datetime(),
  notes: z.string().max(1000).optional()
});

export type MarginConfiguration = z.infer<typeof MarginConfigurationSchema>;

// Provider Performance Analytics
export const ProviderPerformanceSchema = z.object({
  providerId: z.string().uuid(),
  period: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }),
  metrics: z.object({
    totalLeadsReceived: z.number().min(0),
    totalLeadsProcessed: z.number().min(0),
    totalLeadsApproved: z.number().min(0),
    totalLeadsRejected: z.number().min(0),
    totalAmountDisbursed: z.number().min(0),
    averageResponseTime: z.number().min(0), // in hours
    averageLoanAmount: z.number().min(0),
    conversionRate: z.number().min(0).max(100),
    approvalRate: z.number().min(0).max(100),
    customerSatisfactionScore: z.number().min(1).max(5)
  }),
  revenue: z.object({
    totalRevenue: z.number().min(0),
    marginRevenue: z.number().min(0),
    serviceRevenue: z.number().min(0),
    averageRevenuePerLead: z.number().min(0),
    projectedMonthlyRevenue: z.number().min(0)
  }),
  ranking: z.object({
    overallRank: z.number().min(1),
    categoryRank: z.number().min(1),
    performanceScore: z.number().min(0).max(100),
    trendDirection: z.enum(['up', 'down', 'stable'])
  })
});

export type ProviderPerformance = z.infer<typeof ProviderPerformanceSchema>;

// Admin Action Logs
export const AdminActionLogSchema = z.object({
  id: z.string().uuid(),
  adminId: z.string().uuid(),
  providerId: z.string().uuid(),
  action: z.enum([
    'provider_created',
    'provider_approved',
    'provider_rejected',
    'provider_suspended',
    'provider_reactivated',
    'integration_approved',
    'margin_updated',
    'service_level_changed',
    'contract_signed',
    'payment_processed',
    'performance_review'
  ]),
  details: z.object({
    description: z.string(),
    previousValue: z.any().optional(),
    newValue: z.any().optional(),
    reason: z.string().optional()
  }),
  timestamp: z.string().datetime(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});

export type AdminActionLog = z.infer<typeof AdminActionLogSchema>;

// Customer Service Integration Request
export const CustomerServiceRequestSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
  requestType: z.enum([
    'api_integration',
    'webhook_setup',
    'data_mapping',
    'custom_development',
    'troubleshooting',
    'performance_optimization',
    'compliance_setup'
  ]),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  description: z.string().min(10).max(2000),
  technicalDetails: z.object({
    apiEndpoints: z.array(z.string()).optional(),
    dataFormat: z.enum(['json', 'xml', 'csv']).optional(),
    authMethod: z.enum(['api_key', 'oauth', 'jwt', 'basic_auth']).optional(),
    expectedVolume: z.number().min(0).optional(),
    customRequirements: z.string().optional()
  }),
  timeline: z.object({
    requestedCompletionDate: z.string().datetime(),
    estimatedHours: z.number().min(0),
    actualHours: z.number().min(0).optional()
  }),
  status: z.enum(['open', 'in_progress', 'pending_provider', 'completed', 'cancelled']),
  assignedEngineer: z.string().uuid().optional(),
  cost: z.object({
    estimated: z.number().min(0),
    actual: z.number().min(0).optional(),
    billable: z.boolean().default(true)
  }),
  communication: z.array(z.object({
    timestamp: z.string().datetime(),
    from: z.enum(['admin', 'engineer', 'provider']),
    message: z.string(),
    attachments: z.array(z.string()).optional()
  })),
  resolution: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type CustomerServiceRequest = z.infer<typeof CustomerServiceRequestSchema>;

// Revenue Dashboard Data
export const RevenueDashboardSchema = z.object({
  period: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }),
  totalRevenue: z.number().min(0),
  revenueBreakdown: z.object({
    marginRevenue: z.number().min(0),
    serviceRevenue: z.number().min(0),
    setupFees: z.number().min(0),
    customizationFees: z.number().min(0)
  }),
  providerMetrics: z.object({
    totalProviders: z.number().min(0),
    activeProviders: z.number().min(0),
    newProvidersThisPeriod: z.number().min(0),
    averageRevenuePerProvider: z.number().min(0)
  }),
  leadMetrics: z.object({
    totalLeadsDistributed: z.number().min(0),
    totalLeadsApproved: z.number().min(0),
    totalAmountDisbursed: z.number().min(0),
    averageRevenuePerLead: z.number().min(0)
  }),
  projections: z.object({
    nextMonthRevenue: z.number().min(0),
    nextQuarterRevenue: z.number().min(0),
    annualizedRevenue: z.number().min(0)
  }),
  topPerformers: z.array(z.object({
    providerId: z.string().uuid(),
    providerName: z.string(),
    revenue: z.number().min(0),
    leadsProcessed: z.number().min(0),
    conversionRate: z.number().min(0).max(100)
  }))
});

export type RevenueDashboard = z.infer<typeof RevenueDashboardSchema>;

// Error types
export class AdminProviderManagementError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AdminProviderManagementError';
  }
}

export class IntegrationServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'IntegrationServiceError';
  }
}

export class MarginConfigurationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'MarginConfigurationError';
  }
}