import { gql } from 'graphql-tag';

export const typeDefs = gql`
  # Scalar types
  scalar Date
  scalar JSON

  # Enums
  enum RiskLevel {
    LOW
    MEDIUM
    HIGH
    VERY_HIGH
  }

  enum ComplianceStatus {
    PENDING
    IN_PROGRESS
    APPROVED
    REJECTED
  }

  enum AMLStatus {
    PENDING
    CLEAN
    HIT
    ERROR
  }

  enum OverallComplianceStatus {
    COMPLIANT
    NON_COMPLIANT
    PENDING
  }

  enum EmploymentStatus {
    EMPLOYED
    SELF_EMPLOYED
    UNEMPLOYED
    RETIRED
  }

  # Input types
  input CreditApplicationInput {
    userId: ID!
    requestedAmount: Float!
    currency: String!
    loanPurpose: String
    termMonths: Int!
    personalInfo: PersonalInfoInput!
    financialInfo: FinancialInfoInput!
    businessInfo: BusinessInfoInput
  }

  input PersonalInfoInput {
    age: Int!
    employmentStatus: EmploymentStatus!
    monthlyIncome: Float!
    employmentDuration: Int!
    creditHistory: Int!
  }

  input FinancialInfoInput {
    existingDebt: Float!
    monthlyExpenses: Float!
    assets: Float!
    liabilities: Float!
  }

  input BusinessInfoInput {
    businessType: String
    annualRevenue: Float
    yearsInBusiness: Int
    employeeCount: Int
  }

  input KYCApplicationInput {
    userId: ID!
    personalInfo: KYCPersonalInfoInput!
    documents: [KYCDocumentInput!]!
    businessInfo: KYCBusinessInfoInput
  }

  input KYCPersonalInfoInput {
    firstName: String!
    lastName: String!
    dateOfBirth: String!
    nationality: String!
    address: AddressInput!
    phoneNumber: String!
    email: String!
  }

  input AddressInput {
    street: String!
    city: String!
    state: String!
    postalCode: String!
    country: String!
  }

  input KYCDocumentInput {
    type: String!
    documentNumber: String!
    issuingCountry: String!
    expiryDate: String
    fileUrl: String!
    uploadedAt: Date!
  }

  input KYCBusinessInfoInput {
    businessName: String
    businessType: String
    registrationNumber: String
    taxId: String
    businessAddress: AddressInput
  }

  # Core types
  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    createdAt: Date!
    updatedAt: Date!
  }

  type CreditApplication {
    id: ID!
    userId: ID!
    requestedAmount: Float!
    currency: String!
    loanPurpose: String
    termMonths: Int!
    status: String!
    createdAt: Date!
    updatedAt: Date!
  }

  type RiskAssessment {
    assessmentId: ID!
    userId: ID!
    riskScore: Int!
    riskLevel: RiskLevel!
    approved: Boolean!
    maxApprovedAmount: Float!
    interestRate: Float!
    termMonths: Int!
    reasons: [String!]!
    recommendations: [String!]!
    createdAt: Date!
    expiresAt: Date!
  }

  type ComplianceResult {
    complianceId: ID!
    userId: ID!
    kycStatus: ComplianceStatus!
    amlStatus: AMLStatus!
    overallStatus: OverallComplianceStatus!
    riskScore: Int!
    requirements: [String!]!
    nextSteps: [String!]!
    createdAt: Date!
    updatedAt: Date!
  }

  type CreditProvider {
    id: ID!
    name: String!
    type: String!
    status: String!
    apiEndpoint: String
    supportedCurrencies: [String!]!
    minAmount: Float
    maxAmount: Float
    interestRateRange: InterestRateRange
    createdAt: Date!
    updatedAt: Date!
  }

  type InterestRateRange {
    min: Float!
    max: Float!
  }

  type Analytics {
    totalApplications: Int!
    approvedApplications: Int!
    rejectedApplications: Int!
    totalVolume: Float!
    averageRiskScore: Float!
    topProviders: [ProviderStats!]!
    monthlyTrends: [MonthlyTrend!]!
  }

  type ProviderStats {
    providerId: ID!
    providerName: String!
    applicationCount: Int!
    approvalRate: Float!
    totalVolume: Float!
  }

  type MonthlyTrend {
    month: String!
    applications: Int!
    approvals: Int!
    volume: Float!
  }

  # Response types
  type RiskAssessmentResponse {
    success: Boolean!
    data: RiskAssessment
    error: String
  }

  type ComplianceResponse {
    success: Boolean!
    data: ComplianceResult
    error: String
  }

  type CreditApplicationResponse {
    success: Boolean!
    data: CreditApplication
    error: String
  }

  type AnalyticsResponse {
    success: Boolean!
    data: Analytics
    error: String
  }

  # Queries
  type Query {
    # User queries
    user(id: ID!): User
    users(limit: Int, offset: Int): [User!]!

    # Credit application queries
    creditApplication(id: ID!): CreditApplication
    creditApplications(userId: ID, status: String, limit: Int, offset: Int): [CreditApplication!]!

    # Risk assessment queries
    riskAssessment(assessmentId: ID!): RiskAssessment
    riskFactors(userId: ID!): [String!]!

    # Compliance queries
    complianceResult(userId: ID!): ComplianceResult

    # Provider queries
    creditProviders(status: String): [CreditProvider!]!
    creditProvider(id: ID!): CreditProvider

    # Analytics queries
    analytics(timeRange: String): AnalyticsResponse!
    providerAnalytics(providerId: ID!, timeRange: String): ProviderStats
  }

  # Mutations
  type Mutation {
    # Risk assessment mutations
    assessCreditRisk(input: CreditApplicationInput!): RiskAssessmentResponse!

    # Compliance mutations
    processKYC(input: KYCApplicationInput!): ComplianceResponse!

    # Credit application mutations
    createCreditApplication(input: CreditApplicationInput!): CreditApplicationResponse!
    updateCreditApplication(id: ID!, status: String!): CreditApplicationResponse!

    # Provider mutations
    createCreditProvider(input: CreateProviderInput!): CreditProviderResponse!
    updateCreditProvider(id: ID!, input: UpdateProviderInput!): CreditProviderResponse!
  }

  input CreateProviderInput {
    name: String!
    type: String!
    apiEndpoint: String
    supportedCurrencies: [String!]!
    minAmount: Float
    maxAmount: Float
    interestRateRange: InterestRateRangeInput
  }

  input UpdateProviderInput {
    name: String
    status: String
    apiEndpoint: String
    supportedCurrencies: [String!]
    minAmount: Float
    maxAmount: Float
    interestRateRange: InterestRateRangeInput
  }

  input InterestRateRangeInput {
    min: Float!
    max: Float!
  }

  type CreditProviderResponse {
    success: Boolean!
    data: CreditProvider
    error: String
  }
`;
