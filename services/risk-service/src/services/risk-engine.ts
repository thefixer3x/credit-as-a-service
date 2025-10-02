import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import _ from 'lodash';

// Risk assessment schemas
export const CreditApplicationSchema = z.object({
  userId: z.string().uuid(),
  requestedAmount: z.number().positive(),
  currency: z.string().length(3),
  loanPurpose: z.string().optional(),
  termMonths: z.number().positive().max(60),
  personalInfo: z.object({
    age: z.number().min(18).max(100),
    employmentStatus: z.enum(['employed', 'self_employed', 'unemployed', 'retired']),
    monthlyIncome: z.number().positive(),
    employmentDuration: z.number().min(0),
    creditHistory: z.number().min(0).max(850),
  }),
  financialInfo: z.object({
    existingDebt: z.number().min(0),
    monthlyExpenses: z.number().positive(),
    assets: z.number().min(0),
    liabilities: z.number().min(0),
  }),
  businessInfo: z.object({
    businessType: z.string().optional(),
    annualRevenue: z.number().min(0).optional(),
    yearsInBusiness: z.number().min(0).optional(),
    employeeCount: z.number().min(0).optional(),
  }).optional(),
});

export type CreditApplication = z.infer<typeof CreditApplicationSchema>;

export const RiskAssessmentResultSchema = z.object({
  assessmentId: z.string().uuid(),
  userId: z.string().uuid(),
  riskScore: z.number().min(0).max(1000),
  riskLevel: z.enum(['low', 'medium', 'high', 'very_high']),
  approved: z.boolean(),
  maxApprovedAmount: z.number().min(0),
  interestRate: z.number().min(0).max(100),
  termMonths: z.number().positive(),
  reasons: z.array(z.string()),
  recommendations: z.array(z.string()),
  createdAt: z.date(),
  expiresAt: z.date(),
});

export type RiskAssessmentResult = z.infer<typeof RiskAssessmentResultSchema>;

export class RiskEngine {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  async assessCreditRisk(application: CreditApplication): Promise<RiskAssessmentResult> {
    this.logger.info({ userId: application.userId }, 'Starting risk assessment');

    try {
      // Validate input
      const validatedApp = CreditApplicationSchema.parse(application);

      // Calculate risk score using multiple factors
      const riskScore = await this.calculateRiskScore(validatedApp);
      
      // Determine risk level
      const riskLevel = this.determineRiskLevel(riskScore);
      
      // Check if approved
      const approved = riskScore >= 300; // Minimum score for approval
      
      // Calculate approved amount and interest rate
      const maxApprovedAmount = this.calculateMaxApprovedAmount(validatedApp, riskScore);
      const interestRate = this.calculateInterestRate(riskScore, validatedApp.termMonths);
      
      // Generate reasons and recommendations
      const reasons = this.generateReasons(validatedApp, riskScore);
      const recommendations = this.generateRecommendations(validatedApp, riskScore);

      const result: RiskAssessmentResult = {
        assessmentId: uuidv4(),
        userId: validatedApp.userId,
        riskScore,
        riskLevel,
        approved,
        maxApprovedAmount,
        interestRate,
        termMonths: validatedApp.termMonths,
        reasons,
        recommendations,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      this.logger.info(
        { 
          assessmentId: result.assessmentId, 
          userId: result.userId, 
          riskScore, 
          approved 
        }, 
        'Risk assessment completed'
      );

      return result;

    } catch (error) {
      this.logger.error({ error, userId: application.userId }, 'Risk assessment failed');
      throw new Error('Risk assessment failed');
    }
  }

  private async calculateRiskScore(application: CreditApplication): Promise<number> {
    const { personalInfo, financialInfo, businessInfo } = application;
    
    let score = 500; // Base score

    // Credit history factor (40% weight)
    const creditHistoryScore = Math.min(personalInfo.creditHistory / 8.5, 100);
    score += creditHistoryScore * 0.4;

    // Income stability factor (25% weight)
    const incomeStabilityScore = this.calculateIncomeStability(personalInfo);
    score += incomeStabilityScore * 0.25;

    // Debt-to-income ratio factor (20% weight)
    const dtiScore = this.calculateDTIScore(personalInfo.monthlyIncome, financialInfo.existingDebt);
    score += dtiScore * 0.2;

    // Employment stability factor (10% weight)
    const employmentScore = this.calculateEmploymentStability(personalInfo);
    score += employmentScore * 0.1;

    // Business factor (5% weight) - only for business loans
    if (businessInfo) {
      const businessScore = this.calculateBusinessScore(businessInfo);
      score += businessScore * 0.05;
    }

    // Age factor (small adjustment)
    const ageScore = this.calculateAgeScore(personalInfo.age);
    score += ageScore;

    // Ensure score is within bounds
    return Math.max(0, Math.min(1000, Math.round(score)));
  }

  private calculateIncomeStability(personalInfo: any): number {
    const { employmentStatus, employmentDuration, monthlyIncome } = personalInfo;
    
    let stabilityScore = 0;

    // Employment status scoring
    switch (employmentStatus) {
      case 'employed':
        stabilityScore = 80;
        break;
      case 'self_employed':
        stabilityScore = 60;
        break;
      case 'unemployed':
        stabilityScore = 20;
        break;
      case 'retired':
        stabilityScore = 70;
        break;
    }

    // Employment duration bonus
    if (employmentDuration >= 24) {
      stabilityScore += 20;
    } else if (employmentDuration >= 12) {
      stabilityScore += 10;
    } else if (employmentDuration >= 6) {
      stabilityScore += 5;
    }

    // Income level adjustment
    if (monthlyIncome >= 10000) {
      stabilityScore += 10;
    } else if (monthlyIncome >= 5000) {
      stabilityScore += 5;
    }

    return Math.min(100, stabilityScore);
  }

  private calculateDTIScore(monthlyIncome: number, existingDebt: number): number {
    const dti = existingDebt / monthlyIncome;
    
    if (dti <= 0.2) return 100;
    if (dti <= 0.3) return 80;
    if (dti <= 0.4) return 60;
    if (dti <= 0.5) return 40;
    if (dti <= 0.6) return 20;
    return 0;
  }

  private calculateEmploymentStability(personalInfo: any): number {
    const { employmentStatus, employmentDuration } = personalInfo;
    
    if (employmentStatus === 'unemployed') return 0;
    if (employmentStatus === 'retired') return 70;
    
    // Employment duration scoring
    if (employmentDuration >= 36) return 100;
    if (employmentDuration >= 24) return 80;
    if (employmentDuration >= 12) return 60;
    if (employmentDuration >= 6) return 40;
    return 20;
  }

  private calculateBusinessScore(businessInfo: any): number {
    const { yearsInBusiness, annualRevenue, employeeCount } = businessInfo;
    
    let score = 0;

    // Years in business
    if (yearsInBusiness >= 5) score += 40;
    else if (yearsInBusiness >= 3) score += 30;
    else if (yearsInBusiness >= 1) score += 20;
    else score += 10;

    // Revenue size
    if (annualRevenue >= 1000000) score += 30;
    else if (annualRevenue >= 500000) score += 25;
    else if (annualRevenue >= 100000) score += 20;
    else if (annualRevenue >= 50000) score += 15;
    else score += 10;

    // Employee count
    if (employeeCount >= 50) score += 30;
    else if (employeeCount >= 10) score += 25;
    else if (employeeCount >= 5) score += 20;
    else if (employeeCount >= 1) score += 15;
    else score += 10;

    return Math.min(100, score);
  }

  private calculateAgeScore(age: number): number {
    if (age >= 25 && age <= 55) return 10;
    if (age >= 22 && age <= 65) return 5;
    return 0;
  }

  private determineRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'very_high' {
    if (riskScore >= 700) return 'low';
    if (riskScore >= 500) return 'medium';
    if (riskScore >= 300) return 'high';
    return 'very_high';
  }

  private calculateMaxApprovedAmount(application: CreditApplication, riskScore: number): number {
    const { requestedAmount, personalInfo } = application;
    
    // Base approval ratio based on risk score
    let approvalRatio = 0;
    if (riskScore >= 700) approvalRatio = 1.0;
    else if (riskScore >= 600) approvalRatio = 0.8;
    else if (riskScore >= 500) approvalRatio = 0.6;
    else if (riskScore >= 400) approvalRatio = 0.4;
    else if (riskScore >= 300) approvalRatio = 0.2;
    else approvalRatio = 0;

    // Income-based limit (max 5x monthly income)
    const incomeLimit = personalInfo.monthlyIncome * 5;
    
    // Calculate approved amount
    const approvedAmount = Math.min(
      requestedAmount * approvalRatio,
      incomeLimit
    );

    return Math.round(approvedAmount);
  }

  private calculateInterestRate(riskScore: number, termMonths: number): number {
    // Base interest rate
    let baseRate = 0;
    if (riskScore >= 700) baseRate = 8.0;
    else if (riskScore >= 600) baseRate = 12.0;
    else if (riskScore >= 500) baseRate = 16.0;
    else if (riskScore >= 400) baseRate = 20.0;
    else if (riskScore >= 300) baseRate = 24.0;
    else baseRate = 30.0;

    // Term adjustment
    if (termMonths > 36) baseRate += 2.0;
    else if (termMonths > 24) baseRate += 1.0;

    return Math.round(baseRate * 100) / 100;
  }

  private generateReasons(application: CreditApplication, riskScore: number): string[] {
    const reasons: string[] = [];
    const { personalInfo, financialInfo } = application;

    // Credit history reasons
    if (personalInfo.creditHistory < 600) {
      reasons.push('Low credit score');
    } else if (personalInfo.creditHistory >= 750) {
      reasons.push('Excellent credit history');
    }

    // Income reasons
    if (personalInfo.monthlyIncome < 3000) {
      reasons.push('Low monthly income');
    } else if (personalInfo.monthlyIncome >= 10000) {
      reasons.push('High monthly income');
    }

    // Employment reasons
    if (personalInfo.employmentDuration < 6) {
      reasons.push('Short employment history');
    } else if (personalInfo.employmentDuration >= 24) {
      reasons.push('Stable employment history');
    }

    // Debt reasons
    const dti = financialInfo.existingDebt / personalInfo.monthlyIncome;
    if (dti > 0.4) {
      reasons.push('High debt-to-income ratio');
    } else if (dti < 0.2) {
      reasons.push('Low debt-to-income ratio');
    }

    // Risk score reasons
    if (riskScore < 300) {
      reasons.push('High risk profile');
    } else if (riskScore >= 700) {
      reasons.push('Low risk profile');
    }

    return reasons;
  }

  private generateRecommendations(application: CreditApplication, riskScore: number): string[] {
    const recommendations: string[] = [];
    const { personalInfo, financialInfo } = application;

    if (riskScore < 500) {
      recommendations.push('Consider improving credit score before applying');
      recommendations.push('Reduce existing debt to improve debt-to-income ratio');
    }

    if (personalInfo.employmentDuration < 12) {
      recommendations.push('Wait for longer employment history');
    }

    if (financialInfo.existingDebt / personalInfo.monthlyIncome > 0.3) {
      recommendations.push('Consider paying down existing debt');
    }

    if (riskScore >= 500 && riskScore < 700) {
      recommendations.push('Consider a co-signer to improve approval chances');
    }

    return recommendations;
  }
}
