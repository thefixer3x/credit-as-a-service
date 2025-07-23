export interface Provider {
  id: string;
  name: string;
  type: 'bank' | 'fintech' | 'mfi' | 'p2p' | 'cooperative';
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  minInterestRate: number;
  maxInterestRate: number;
  riskAppetite: 'conservative' | 'moderate' | 'aggressive';
  geographies: string[];
  currencies: string[];
  processingTimeHours: number;
  requirements: ProviderRequirement[];
  fees: ProviderFee[];
  isActive: boolean;
  funding: ProviderFunding;
  preferences: ProviderPreferences;
}

export interface ProviderRequirement {
  type: 'kyc' | 'income_verification' | 'collateral' | 'guarantor' | 'business_registration';
  required: boolean;
  description: string;
}

export interface ProviderFee {
  type: 'origination' | 'processing' | 'late_payment' | 'early_repayment';
  amount?: number;
  percentage?: number;
  description: string;
}

export interface ProviderFunding {
  availableAmount: number;
  reservedAmount: number;
  totalCapacity: number;
  lastUpdated: Date;
}

export interface ProviderPreferences {
  preferredRiskGrades: ('A' | 'B' | 'C' | 'D' | 'E')[];
  excludedIndustries: string[];
  minCreditHistory: number; // months
  maxDebtToIncome: number;
  requiresGuarantor: boolean;
  allowsRefinancing: boolean;
}

export interface OfferRequest {
  userId: string;
  applicationId: string;
  requestedAmount: number;
  requestedTermMonths: number;
  currency: string;
  purpose: string;
  urgency: 'low' | 'medium' | 'high';
  preferences?: UserPreferences;
}

export interface UserPreferences {
  maxInterestRate?: number;
  preferredProviderTypes?: Provider['type'][];
  maxProcessingTime?: number;
  flexibleAmount: boolean;
  flexibleTerm: boolean;
}

export interface CreditOffer {
  id: string;
  providerId: string;
  providerName: string;
  userId: string;
  applicationId: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  currency: string;
  monthlyPayment: number;
  totalPayment: number;
  fees: OfferFee[];
  requirements: string[];
  conditions: string[];
  score: number; // Matching score 0-100
  ranking: number;
  processingTimeHours: number;
  validUntil: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  metadata: OfferMetadata;
  createdAt: Date;
}

export interface OfferFee {
  type: string;
  amount: number;
  description: string;
}

export interface OfferMetadata {
  riskAssessment: {
    riskScore: number;
    riskGrade: string;
    probabilityOfDefault: number;
  };
  matching: {
    riskMatch: number;
    amountMatch: number;
    termMatch: number;
    geographyMatch: number;
    requirementsMatch: number;
  };
  pricing: {
    baseRate: number;
    riskPremium: number;
    competitiveAdjustment: number;
    finalRate: number;
  };
}

export interface OfferComparison {
  offers: CreditOffer[];
  bestOffer: CreditOffer;
  insights: OfferInsight[];
  alternatives: AlternativeOffer[];
  marketAnalysis: MarketAnalysis;
}

export interface OfferInsight {
  type: 'savings' | 'risk' | 'time' | 'flexibility';
  message: string;
  impact: 'positive' | 'negative' | 'neutral';
  amount?: number;
}

export interface AlternativeOffer {
  type: 'higher_amount' | 'lower_rate' | 'shorter_term' | 'different_provider';
  description: string;
  tradeoff: string;
  offers: CreditOffer[];
}

export interface MarketAnalysis {
  averageRate: number;
  rateRange: { min: number; max: number };
  competitivePosition: 'excellent' | 'good' | 'average' | 'poor';
  marketTrends: string[];
  recommendations: string[];
}

export interface MatchingCriteria {
  riskCompatibility: number; // Weight for risk grade matching
  amountFlexibility: number; // Weight for amount matching
  termFlexibility: number; // Weight for term matching
  rateCompetitiveness: number; // Weight for interest rate
  processingSpeed: number; // Weight for processing time
  providerReliability: number; // Weight for provider reputation
  feeStructure: number; // Weight for fee comparison
  requirementsMatch: number; // Weight for requirements compatibility
}

export interface PricingModel {
  baseRate: number;
  riskPremiums: Record<string, number>; // By risk grade
  competitiveFactors: {
    marketRate: number;
    positioningStrategy: 'aggressive' | 'market' | 'premium';
    volumeDiscounts: VolumeDiscount[];
  };
  seasonalAdjustments: SeasonalAdjustment[];
}

export interface VolumeDiscount {
  minAmount: number;
  maxAmount: number;
  discountBps: number; // Basis points
}

export interface SeasonalAdjustment {
  startDate: string; // MM-DD format
  endDate: string;
  adjustmentBps: number;
  reason: string;
}

export interface OfferAnalytics {
  userId: string;
  applicationId: string;
  totalOffers: number;
  acceptedOffer?: string;
  acceptanceRate: number;
  averageRate: number;
  averageAmount: number;
  processingTime: number;
  conversionFunnel: ConversionStep[];
  providerPerformance: ProviderPerformance[];
}

export interface ConversionStep {
  step: 'offers_generated' | 'offers_viewed' | 'offer_selected' | 'application_submitted' | 'loan_approved';
  count: number;
  timestamp: Date;
}

export interface ProviderPerformance {
  providerId: string;
  offersGenerated: number;
  offersAccepted: number;
  acceptanceRate: number;
  averageProcessingTime: number;
  customerSatisfaction: number;
}