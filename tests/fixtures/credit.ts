export const creditApplicationFixtures = {
  pendingApplication: {
    id: 'app-001',
    userId: 'user-001',
    tenantId: 'tenant-001',
    amount: 25000.00,
    purpose: 'Business expansion - new equipment',
    termRequested: 24,
    status: 'pending',
    riskScore: 750,
    submittedAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    documents: [
      {
        type: 'business_license',
        url: 'https://docs.example.com/business_license.pdf',
        uploadedAt: new Date('2024-01-15T09:30:00Z'),
      },
      {
        type: 'financial_statements',
        url: 'https://docs.example.com/financials.pdf',
        uploadedAt: new Date('2024-01-15T09:45:00Z'),
      },
    ],
  },

  approvedApplication: {
    id: 'app-002',
    userId: 'user-001',
    tenantId: 'tenant-001',
    amount: 15000.00,
    purpose: 'Inventory purchase for Q1',
    termRequested: 12,
    status: 'approved',
    riskScore: 820,
    decision: 'approved',
    submittedAt: new Date('2024-01-10T14:00:00Z'),
    processedAt: new Date('2024-01-12T09:15:00Z'),
    createdAt: new Date('2024-01-10T14:00:00Z'),
    updatedAt: new Date('2024-01-12T09:15:00Z'),
    reviewNotes: 'Strong credit history, stable business revenue',
  },

  rejectedApplication: {
    id: 'app-003',
    userId: 'user-002',
    tenantId: 'tenant-001',
    amount: 50000.00,
    purpose: 'Real estate investment',
    termRequested: 36,
    status: 'rejected',
    riskScore: 580,
    decision: 'rejected',
    submittedAt: new Date('2024-01-08T11:00:00Z'),
    processedAt: new Date('2024-01-09T16:30:00Z'),
    createdAt: new Date('2024-01-08T11:00:00Z'),
    updatedAt: new Date('2024-01-09T16:30:00Z'),
    rejectionReason: 'Insufficient credit history and high debt-to-income ratio',
  },

  underReviewApplication: {
    id: 'app-004',
    userId: 'user-002',
    tenantId: 'tenant-001',
    amount: 30000.00,
    purpose: 'Equipment upgrade',
    termRequested: 18,
    status: 'under_review',
    riskScore: 690,
    submittedAt: new Date('2024-01-20T09:00:00Z'),
    createdAt: new Date('2024-01-20T09:00:00Z'),
    updatedAt: new Date('2024-01-21T14:00:00Z'),
    additionalDocumentsRequested: [
      'updated_bank_statements',
      'proof_of_income',
    ],
  },

  highAmountApplication: {
    id: 'app-005',
    userId: 'lender-001',
    tenantId: 'tenant-001',
    amount: 100000.00,
    purpose: 'Commercial property acquisition',
    termRequested: 60,
    status: 'pending',
    riskScore: 800,
    submittedAt: new Date('2024-01-22T08:00:00Z'),
    createdAt: new Date('2024-01-22T08:00:00Z'),
    updatedAt: new Date('2024-01-22T08:00:00Z'),
    requiresManualReview: true,
  },
};

export const creditOfferFixtures = {
  pendingOffer: {
    id: 'offer-001',
    applicationId: 'app-002',
    lenderId: 'lender-001',
    amount: 15000.00,
    interestRate: 0.0875, // 8.75%
    termMonths: 12,
    monthlyPayment: 1318.75,
    status: 'pending',
    offerType: 'standard',
    fees: {
      originationFee: 300.00,
      processingFee: 50.00,
    },
    conditions: [
      'Maintain minimum business checking balance of $5,000',
      'Provide quarterly financial statements',
    ],
    expiresAt: new Date('2024-01-25T23:59:59Z'),
    createdAt: new Date('2024-01-12T09:15:00Z'),
    updatedAt: new Date('2024-01-12T09:15:00Z'),
  },

  acceptedOffer: {
    id: 'offer-002', 
    applicationId: 'app-002',
    lenderId: 'lender-001',
    amount: 15000.00,
    interestRate: 0.0850, // 8.50%
    termMonths: 12,
    monthlyPayment: 1313.13,
    status: 'accepted',
    offerType: 'preferred',
    fees: {
      originationFee: 225.00, // Reduced fee for preferred customers
      processingFee: 25.00,
    },
    acceptedAt: new Date('2024-01-13T14:30:00Z'),
    createdAt: new Date('2024-01-12T10:00:00Z'),
    updatedAt: new Date('2024-01-13T14:30:00Z'),
  },

  expiredOffer: {
    id: 'offer-003',
    applicationId: 'app-001',
    lenderId: 'lender-001',
    amount: 25000.00,
    interestRate: 0.0925, // 9.25%
    termMonths: 24,
    monthlyPayment: 1156.25,
    status: 'expired',
    offerType: 'standard',
    fees: {
      originationFee: 500.00,
      processingFee: 75.00,
    },
    expiresAt: new Date('2024-01-20T23:59:59Z'),
    createdAt: new Date('2024-01-13T11:00:00Z'),
    updatedAt: new Date('2024-01-21T00:00:00Z'),
  },

  rejectedOffer: {
    id: 'offer-004',
    applicationId: 'app-001',
    lenderId: 'lender-001',
    amount: 25000.00,
    interestRate: 0.0900, // 9.00%
    termMonths: 24,
    monthlyPayment: 1144.44,
    status: 'rejected',
    offerType: 'standard',
    rejectedAt: new Date('2024-01-16T10:15:00Z'),
    rejectionReason: 'Interest rate too high',
    createdAt: new Date('2024-01-14T09:00:00Z'),
    updatedAt: new Date('2024-01-16T10:15:00Z'),
  },
};

export const creditLineFixtures = {
  activeCreditLine: {
    id: 'line-001',
    userId: 'user-001',
    tenantId: 'tenant-001',
    offerId: 'offer-002',
    totalAmount: 15000.00,
    availableAmount: 12000.00,
    usedAmount: 3000.00,
    interestRate: 0.0850,
    termMonths: 12,
    monthlyPayment: 1313.13,
    status: 'active',
    disbursementMethod: 'bank_transfer',
    repaymentMethod: 'auto_debit',
    nextPaymentDate: new Date('2024-02-13T00:00:00Z'),
    maturityDate: new Date('2025-01-13T00:00:00Z'),
    activatedAt: new Date('2024-01-13T15:00:00Z'),
    createdAt: new Date('2024-01-13T14:30:00Z'),
    updatedAt: new Date('2024-01-22T10:00:00Z'),
  },

  fullyUtilizedCreditLine: {
    id: 'line-002',
    userId: 'user-002',
    tenantId: 'tenant-001',
    offerId: 'offer-005',
    totalAmount: 20000.00,
    availableAmount: 0.00,
    usedAmount: 20000.00,
    interestRate: 0.0950,
    termMonths: 18,
    monthlyPayment: 1244.89,
    status: 'active',
    disbursementMethod: 'bank_transfer',
    repaymentMethod: 'manual',
    nextPaymentDate: new Date('2024-02-05T00:00:00Z'),
    maturityDate: new Date('2025-07-05T00:00:00Z'),
    activatedAt: new Date('2024-01-05T12:00:00Z'),
    createdAt: new Date('2024-01-05T11:30:00Z'),
    updatedAt: new Date('2024-01-20T14:00:00Z'),
  },

  closedCreditLine: {
    id: 'line-003',
    userId: 'user-001',
    tenantId: 'tenant-001',
    offerId: 'offer-101',
    totalAmount: 10000.00,
    availableAmount: 0.00,
    usedAmount: 0.00,
    interestRate: 0.0800,
    termMonths: 12,
    monthlyPayment: 0.00,
    status: 'closed',
    disbursementMethod: 'bank_transfer',
    repaymentMethod: 'auto_debit',
    activatedAt: new Date('2023-08-15T10:00:00Z'),
    closedAt: new Date('2024-01-15T16:00:00Z'),
    createdAt: new Date('2023-08-15T09:30:00Z'),
    updatedAt: new Date('2024-01-15T16:00:00Z'),
    closureReason: 'Fully repaid',
  },
};

export const creditAssessmentFixtures = {
  lowRiskAssessment: {
    id: 'assessment-001',
    applicationId: 'app-002',
    userId: 'user-001',
    overallScore: 820,
    riskLevel: 'low',
    recommendedAction: 'approve',
    maxRecommendedAmount: 25000.00,
    recommendedInterestRate: 0.0750,
    factors: {
      creditHistory: {
        score: 85,
        weight: 0.35,
        details: 'Excellent payment history, no delinquencies',
      },
      financialStability: {
        score: 90,
        weight: 0.25,
        details: 'Stable income, strong cash flow',
      },
      businessPerformance: {
        score: 80,
        weight: 0.20,
        details: 'Growing revenue, healthy profit margins',
      },
      debtToIncomeRatio: {
        score: 75,
        weight: 0.15,
        details: 'Moderate debt levels, manageable obligations',
      },
      industryRisk: {
        score: 70,
        weight: 0.05,
        details: 'Stable industry with growth potential',
      },
    },
    externalScores: {
      creditBureau: 780,
      businessRating: 'A-',
      industryBenchmark: 'Above Average',
    },
    assessedAt: new Date('2024-01-11T16:00:00Z'),
    createdAt: new Date('2024-01-11T16:00:00Z'),
    updatedAt: new Date('2024-01-11T16:00:00Z'),
  },

  highRiskAssessment: {
    id: 'assessment-002',
    applicationId: 'app-003',
    userId: 'user-002',
    overallScore: 580,
    riskLevel: 'high',
    recommendedAction: 'reject',
    maxRecommendedAmount: 0.00,
    recommendedInterestRate: null,
    factors: {
      creditHistory: {
        score: 45,
        weight: 0.35,
        details: 'Multiple late payments, previous defaults',
      },
      financialStability: {
        score: 60,
        weight: 0.25,
        details: 'Inconsistent income, volatile cash flow',
      },
      businessPerformance: {
        score: 55,
        weight: 0.20,
        details: 'Declining revenue, narrow profit margins',
      },
      debtToIncomeRatio: {
        score: 40,
        weight: 0.15,
        details: 'High debt levels, stretched obligations',
      },
      industryRisk: {
        score: 50,
        weight: 0.05,
        details: 'Declining industry, uncertain outlook',
      },
    },
    externalScores: {
      creditBureau: 520,
      businessRating: 'C+',
      industryBenchmark: 'Below Average',
    },
    redFlags: [
      'Recent bankruptcy filing',
      'Multiple collection accounts',
      'Inconsistent financial reporting',
    ],
    assessedAt: new Date('2024-01-09T14:00:00Z'),
    createdAt: new Date('2024-01-09T14:00:00Z'),
    updatedAt: new Date('2024-01-09T14:00:00Z'),
  },

  mediumRiskAssessment: {
    id: 'assessment-003',
    applicationId: 'app-004',
    userId: 'user-002',
    overallScore: 690,
    riskLevel: 'medium',
    recommendedAction: 'conditional_approve',
    maxRecommendedAmount: 20000.00,
    recommendedInterestRate: 0.0925,
    factors: {
      creditHistory: {
        score: 70,
        weight: 0.35,
        details: 'Good payment history with minor issues',
      },
      financialStability: {
        score: 65,
        weight: 0.25,
        details: 'Adequate income, some volatility',
      },
      businessPerformance: {
        score: 72,
        weight: 0.20,
        details: 'Steady growth, acceptable margins',
      },
      debtToIncomeRatio: {
        score: 68,
        weight: 0.15,
        details: 'Moderate debt levels, manageable',
      },
      industryRisk: {
        score: 75,
        weight: 0.05,
        details: 'Stable industry, moderate growth',
      },
    },
    conditions: [
      'Provide personal guarantee',
      'Maintain minimum cash balance',
      'Submit quarterly financial updates',
    ],
    assessedAt: new Date('2024-01-21T11:00:00Z'),
    createdAt: new Date('2024-01-21T11:00:00Z'),
    updatedAt: new Date('2024-01-21T11:00:00Z'),
  },
};

// Helper functions
export function getApplicationById(id: string) {
  return Object.values(creditApplicationFixtures).find(app => app.id === id);
}

export function getApplicationsByUser(userId: string) {
  return Object.values(creditApplicationFixtures).filter(app => app.userId === userId);
}

export function getApplicationsByStatus(status: string) {
  return Object.values(creditApplicationFixtures).filter(app => app.status === status);
}

export function getOfferById(id: string) {
  return Object.values(creditOfferFixtures).find(offer => offer.id === id);
}

export function getOffersByApplication(applicationId: string) {
  return Object.values(creditOfferFixtures).filter(offer => offer.applicationId === applicationId);
}

export function getOffersByLender(lenderId: string) {
  return Object.values(creditOfferFixtures).filter(offer => offer.lenderId === lenderId);
}

export function getCreditLineById(id: string) {
  return Object.values(creditLineFixtures).find(line => line.id === id);
}

export function getCreditLinesByUser(userId: string) {
  return Object.values(creditLineFixtures).filter(line => line.userId === userId);
}

export function getActiveCreditLines() {
  return Object.values(creditLineFixtures).filter(line => line.status === 'active');
}

export function getAssessmentById(id: string) {
  return Object.values(creditAssessmentFixtures).find(assessment => assessment.id === id);
}

export function getAssessmentByApplication(applicationId: string) {
  return Object.values(creditAssessmentFixtures).find(assessment => assessment.applicationId === applicationId);
}

// Mock calculation functions
export function calculateMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  const monthlyRate = annualRate / 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                  (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(payment * 100) / 100;
}

export function calculateTotalInterest(principal: number, monthlyPayment: number, termMonths: number): number {
  return (monthlyPayment * termMonths) - principal;
}

export function calculateRemainingBalance(
  principal: number, 
  monthlyPayment: number, 
  paymentsRemaining: number
): number {
  // Simplified calculation - in real implementation would account for interest schedule
  return Math.max(0, principal - (monthlyPayment * (12 - paymentsRemaining)));
}