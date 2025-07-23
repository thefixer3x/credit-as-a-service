import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { evaluate } from 'mathjs';
import * as tf from '@tensorflow/tfjs-node';

import { SMEAPIClient } from '@caas/sme-integration';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'underwriting-engine' });
const env = validateEnv();

export interface CreditAssessmentRequest {
  userId: string;
  applicationId: string;
  requestedAmount: number;
  currency: string;
  purpose: string;
  organizationId?: string;
  additionalData?: Record<string, any>;
}

export interface CreditAssessmentResult {
  assessmentId: string;
  userId: string;
  applicationId: string;
  riskScore: number;
  riskGrade: 'A' | 'B' | 'C' | 'D' | 'E';
  probabilityOfDefault: number;
  recommendation: 'approve' | 'approve_with_conditions' | 'reject' | 'refer_for_manual_review';
  recommendedAmount?: number;
  recommendedRate?: number;
  recommendedTerm?: number;
  conditions?: string[];
  riskFactors: string[];
  positiveFactors: string[];
  confidenceLevel: number;
  modelVersion: string;
  processedAt: Date;
  expiresAt: Date;
}

export interface FinancialData {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingDebt: number;
  bankBalance: number;
  cashFlow: number;
  creditHistory?: CreditHistoryItem[];
  businessRevenue?: number;
  businessExpenses?: number;
}

export interface CreditHistoryItem {
  type: 'loan' | 'credit_card' | 'mortgage' | 'utility';
  amount: number;
  status: 'current' | 'late' | 'defaulted' | 'closed';
  monthsHistory: number;
  paymentHistory: ('on_time' | 'late' | 'missed')[];
}

export interface RiskFactors {
  debtToIncomeRatio: number;
  creditUtilization: number;
  paymentHistory: number;
  lengthOfHistory: number;
  accountTypes: number;
  recentInquiries: number;
  businessStability?: number;
  industryRisk?: number;
}

export class UnderwritingEngine {
  private smeClient: SMEAPIClient;
  private model: tf.LayersModel | null = null;
  private riskRules: Map<string, any> = new Map();

  constructor() {
    this.smeClient = new SMEAPIClient();
    this.initializeRiskRules();
    this.loadMLModel();
  }

  /**
   * Main credit assessment method
   */
  async assessCreditApplication(request: CreditAssessmentRequest): Promise<CreditAssessmentResult> {
    try {
      logger.info({ applicationId: request.applicationId }, 'Starting credit assessment');

      // 1. Gather data from multiple sources
      const userData = await this.gatherUserData(request.userId);
      const financialData = await this.gatherFinancialData(request.userId);
      const kycData = await this.gatherKYCData(request.userId);
      
      // 2. Calculate risk factors
      const riskFactors = this.calculateRiskFactors(financialData, userData);
      
      // 3. Apply business rules
      const rulesResult = await this.applyBusinessRules(request, riskFactors, userData);
      
      // 4. ML model scoring (if available)
      const mlScore = await this.calculateMLRiskScore(riskFactors, userData);
      
      // 5. Combine scores and make recommendation
      const finalAssessment = this.combineScoresAndRecommend(
        request,
        rulesResult,
        mlScore,
        riskFactors
      );

      // 6. Store assessment result
      await this.storeAssessment(finalAssessment);

      logger.info({
        assessmentId: finalAssessment.assessmentId,
        riskScore: finalAssessment.riskScore,
        recommendation: finalAssessment.recommendation
      }, 'Credit assessment completed');

      return finalAssessment;

    } catch (error) {
      logger.error({ error, applicationId: request.applicationId }, 'Credit assessment failed');
      throw new Error('Credit assessment failed');
    }
  }

  /**
   * Gather user data from SME platform
   */
  private async gatherUserData(userId: string): Promise<any> {
    try {
      const user = await this.smeClient.getUser(userId);
      return {
        id: user.id,
        email: user.email,
        kycStatus: user.kycStatus,
        businessId: user.businessId,
        permissions: user.permissions,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      };
    } catch (error) {
      logger.warn({ userId, error }, 'Failed to gather user data from SME');
      return null;
    }
  }

  /**
   * Gather financial data
   */
  private async gatherFinancialData(userId: string): Promise<FinancialData> {
    try {
      // Get payment accounts and transaction history
      const accounts = await this.smeClient.getPaymentAccounts(userId);
      const transactions = [];
      
      for (const account of accounts) {
        const accountTransactions = await this.smeClient.getTransactions(account.id, {
          limit: 100,
          startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        });
        transactions.push(...accountTransactions);
      }

      // Analyze transactions to extract financial patterns
      const income = this.calculateMonthlyIncome(transactions);
      const expenses = this.calculateMonthlyExpenses(transactions);
      const balance = await this.getCurrentBalance(accounts);

      return {
        monthlyIncome: income,
        monthlyExpenses: expenses,
        existingDebt: 0, // Would be calculated from credit accounts
        bankBalance: balance,
        cashFlow: income - expenses,
        creditHistory: [] // Would be fetched from credit bureau
      };

    } catch (error) {
      logger.warn({ userId, error }, 'Failed to gather financial data');
      // Return default/conservative values
      return {
        monthlyIncome: 0,
        monthlyExpenses: 0,
        existingDebt: 0,
        bankBalance: 0,
        cashFlow: 0
      };
    }
  }

  /**
   * Gather KYC data
   */
  private async gatherKYCData(userId: string): Promise<any> {
    try {
      return await this.smeClient.getKYCData(userId);
    } catch (error) {
      logger.warn({ userId, error }, 'Failed to gather KYC data');
      return null;
    }
  }

  /**
   * Calculate risk factors from financial data
   */
  private calculateRiskFactors(financialData: FinancialData, userData: any): RiskFactors {
    const debtToIncomeRatio = financialData.monthlyIncome > 0 
      ? financialData.existingDebt / financialData.monthlyIncome 
      : 1;

    const creditUtilization = 0; // Would calculate from credit accounts
    const paymentHistory = 0.8; // Would calculate from historical payments
    const lengthOfHistory = userData?.createdAt 
      ? (Date.now() - new Date(userData.createdAt).getTime()) / (365 * 24 * 60 * 60 * 1000)
      : 0;

    return {
      debtToIncomeRatio,
      creditUtilization,
      paymentHistory,
      lengthOfHistory,
      accountTypes: 1, // Number of different account types
      recentInquiries: 0 // Number of recent credit inquiries
    };
  }

  /**
   * Apply business rules for credit assessment
   */
  private async applyBusinessRules(
    request: CreditAssessmentRequest,
    riskFactors: RiskFactors,
    userData: any
  ): Promise<any> {
    const rules = {
      // Maximum debt-to-income ratio
      maxDebtToIncome: 0.4,
      
      // Minimum monthly income
      minMonthlyIncome: 50000, // ₦50,000
      
      // KYC requirements
      requiresVerifiedKYC: true,
      
      // Maximum loan amount based on income
      maxLoanToIncomeRatio: 5,
      
      // Minimum account age (months)
      minAccountAge: 3,
      
      // Industry risk factors
      highRiskIndustries: ['gambling', 'crypto', 'adult'],
      
      // Geographic restrictions
      allowedCountries: ['NG', 'GH', 'KE']
    };

    const violations = [];
    const warnings = [];

    // Check debt-to-income ratio
    if (riskFactors.debtToIncomeRatio > rules.maxDebtToIncome) {
      violations.push(`Debt-to-income ratio ${riskFactors.debtToIncomeRatio.toFixed(2)} exceeds maximum ${rules.maxDebtToIncome}`);
    }

    // Check KYC status
    if (rules.requiresVerifiedKYC && userData?.kycStatus !== 'verified') {
      violations.push('KYC verification required');
    }

    // Check account age
    if (riskFactors.lengthOfHistory < rules.minAccountAge / 12) {
      warnings.push('Account age below preferred minimum');
    }

    // Calculate rules-based score (0-1 scale)
    let rulesScore = 1.0;
    rulesScore -= violations.length * 0.3;
    rulesScore -= warnings.length * 0.1;
    rulesScore = Math.max(0, Math.min(1, rulesScore));

    return {
      score: rulesScore,
      violations,
      warnings,
      passed: violations.length === 0
    };
  }

  /**
   * Calculate ML-based risk score
   */
  private async calculateMLRiskScore(riskFactors: RiskFactors, userData: any): Promise<number> {
    try {
      if (!this.model) {
        // Fallback to simple heuristic scoring
        return this.calculateHeuristicScore(riskFactors);
      }

      // Prepare features for ML model
      const features = this.prepareFeatures(riskFactors, userData);
      const prediction = this.model.predict(features) as tf.Tensor;
      const score = await prediction.data();
      
      return score[0]; // Return first prediction

    } catch (error) {
      logger.warn({ error }, 'ML scoring failed, using heuristic');
      return this.calculateHeuristicScore(riskFactors);
    }
  }

  /**
   * Heuristic scoring when ML model is not available
   */
  private calculateHeuristicScore(riskFactors: RiskFactors): number {
    let score = 0.5; // Start with neutral score

    // Debt-to-income impact
    if (riskFactors.debtToIncomeRatio < 0.2) score += 0.2;
    else if (riskFactors.debtToIncomeRatio < 0.3) score += 0.1;
    else if (riskFactors.debtToIncomeRatio > 0.5) score -= 0.3;

    // Payment history impact
    score += (riskFactors.paymentHistory - 0.5) * 0.4;

    // Length of history impact
    if (riskFactors.lengthOfHistory > 2) score += 0.1;
    else if (riskFactors.lengthOfHistory < 0.5) score -= 0.2;

    // Credit utilization impact
    if (riskFactors.creditUtilization < 0.3) score += 0.1;
    else if (riskFactors.creditUtilization > 0.8) score -= 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Combine all scores and make final recommendation
   */
  private combineScoresAndRecommend(
    request: CreditAssessmentRequest,
    rulesResult: any,
    mlScore: number,
    riskFactors: RiskFactors
  ): CreditAssessmentResult {
    // Weighted combination of scores
    const rulesWeight = 0.6;
    const mlWeight = 0.4;
    
    const combinedScore = (rulesResult.score * rulesWeight) + (mlScore * mlWeight);
    const riskScore = Math.round(combinedScore * 1000); // Convert to 0-1000 scale
    
    // Determine risk grade
    const riskGrade = this.calculateRiskGrade(riskScore);
    
    // Calculate probability of default
    const probabilityOfDefault = Math.max(0, Math.min(1, 1 - combinedScore));
    
    // Make recommendation
    const recommendation = this.makeRecommendation(
      riskScore,
      rulesResult,
      request.requestedAmount,
      riskFactors
    );

    // Calculate recommended terms
    const terms = this.calculateRecommendedTerms(
      request.requestedAmount,
      riskScore,
      riskFactors
    );

    return {
      assessmentId: uuidv4(),
      userId: request.userId,
      applicationId: request.applicationId,
      riskScore,
      riskGrade,
      probabilityOfDefault,
      recommendation: recommendation.decision,
      recommendedAmount: terms.amount,
      recommendedRate: terms.interestRate,
      recommendedTerm: terms.termMonths,
      conditions: recommendation.conditions,
      riskFactors: this.identifyRiskFactors(riskFactors, rulesResult),
      positiveFactors: this.identifyPositiveFactors(riskFactors, rulesResult),
      confidenceLevel: this.calculateConfidenceLevel(riskFactors),
      modelVersion: '1.0.0',
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };
  }

  /**
   * Helper methods
   */
  private calculateRiskGrade(riskScore: number): 'A' | 'B' | 'C' | 'D' | 'E' {
    if (riskScore >= 800) return 'A';
    if (riskScore >= 700) return 'B';
    if (riskScore >= 600) return 'C';
    if (riskScore >= 500) return 'D';
    return 'E';
  }

  private makeRecommendation(
    riskScore: number,
    rulesResult: any,
    requestedAmount: number,
    riskFactors: RiskFactors
  ) {
    if (!rulesResult.passed) {
      return {
        decision: 'reject' as const,
        conditions: rulesResult.violations
      };
    }

    if (riskScore >= 700) {
      return {
        decision: 'approve' as const,
        conditions: []
      };
    }

    if (riskScore >= 600) {
      return {
        decision: 'approve_with_conditions' as const,
        conditions: ['Reduced loan amount', 'Higher interest rate', 'Additional collateral']
      };
    }

    if (riskScore >= 400) {
      return {
        decision: 'refer_for_manual_review' as const,
        conditions: ['Manual underwriter review required']
      };
    }

    return {
      decision: 'reject' as const,
      conditions: ['High risk score']
    };
  }

  private calculateRecommendedTerms(requestedAmount: number, riskScore: number, riskFactors: RiskFactors) {
    // Base interest rate
    let interestRate = 0.15; // 15% base rate

    // Adjust based on risk score
    if (riskScore >= 800) interestRate = 0.08;
    else if (riskScore >= 700) interestRate = 0.12;
    else if (riskScore >= 600) interestRate = 0.18;
    else if (riskScore >= 500) interestRate = 0.25;
    else interestRate = 0.35;

    // Adjust loan amount based on risk
    let recommendedAmount = requestedAmount;
    if (riskScore < 700) {
      recommendedAmount = Math.min(requestedAmount, requestedAmount * 0.7);
    }
    if (riskScore < 600) {
      recommendedAmount = Math.min(requestedAmount, requestedAmount * 0.5);
    }

    // Standard term based on amount
    let termMonths = 12;
    if (recommendedAmount > 1000000) termMonths = 24;
    if (recommendedAmount > 5000000) termMonths = 36;

    return {
      amount: Math.round(recommendedAmount),
      interestRate: Number(interestRate.toFixed(4)),
      termMonths
    };
  }

  private identifyRiskFactors(riskFactors: RiskFactors, rulesResult: any): string[] {
    const factors = [];

    if (riskFactors.debtToIncomeRatio > 0.4) {
      factors.push('High debt-to-income ratio');
    }
    if (riskFactors.paymentHistory < 0.8) {
      factors.push('Poor payment history');
    }
    if (riskFactors.lengthOfHistory < 1) {
      factors.push('Limited credit history');
    }
    if (rulesResult.violations?.length > 0) {
      factors.push(...rulesResult.violations);
    }

    return factors;
  }

  private identifyPositiveFactors(riskFactors: RiskFactors, rulesResult: any): string[] {
    const factors = [];

    if (riskFactors.debtToIncomeRatio < 0.2) {
      factors.push('Low debt-to-income ratio');
    }
    if (riskFactors.paymentHistory > 0.9) {
      factors.push('Excellent payment history');
    }
    if (riskFactors.lengthOfHistory > 3) {
      factors.push('Long credit history');
    }

    return factors;
  }

  private calculateConfidenceLevel(riskFactors: RiskFactors): number {
    let confidence = 0.5;

    // More data points increase confidence
    if (riskFactors.lengthOfHistory > 1) confidence += 0.2;
    if (riskFactors.accountTypes > 2) confidence += 0.1;
    if (riskFactors.paymentHistory > 0) confidence += 0.2;

    return Math.min(1, confidence);
  }

  // Initialize risk rules engine
  private initializeRiskRules(): void {
    // Implementation would load rules from database or configuration
    logger.info('Risk rules initialized');
  }

  // Load ML model
  private async loadMLModel(): Promise<void> {
    try {
      // In production, this would load a trained model
      // this.model = await tf.loadLayersModel('file://./models/credit-risk-model.json');
      logger.info('ML model loading skipped (demo mode)');
    } catch (error) {
      logger.warn('Failed to load ML model, using heuristic scoring');
    }
  }

  // Helper methods for financial calculations
  private calculateMonthlyIncome(transactions: any[]): number {
    const credits = transactions
      .filter(t => t.type === 'credit' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    return credits / 3; // Average over 3 months
  }

  private calculateMonthlyExpenses(transactions: any[]): number {
    const debits = transactions
      .filter(t => t.type === 'debit' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    return debits / 3; // Average over 3 months
  }

  private async getCurrentBalance(accounts: any[]): Promise<number> {
    let totalBalance = 0;
    
    for (const account of accounts) {
      try {
        const balance = await this.smeClient.getAccountBalance(account.id);
        totalBalance += balance.balance;
      } catch (error) {
        logger.warn({ accountId: account.id }, 'Failed to get account balance');
      }
    }
    
    return totalBalance;
  }

  private prepareFeatures(riskFactors: RiskFactors, userData: any): tf.Tensor {
    const features = [
      riskFactors.debtToIncomeRatio,
      riskFactors.creditUtilization,
      riskFactors.paymentHistory,
      riskFactors.lengthOfHistory,
      riskFactors.accountTypes,
      riskFactors.recentInquiries
    ];
    
    return tf.tensor2d([features]);
  }

  private async storeAssessment(assessment: CreditAssessmentResult): Promise<void> {
    // In production, store in database
    logger.info({ assessmentId: assessment.assessmentId }, 'Assessment stored');
  }
}