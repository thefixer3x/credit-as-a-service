import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { UnderwritingEngine } from '@services/underwriting/src/services/underwriting-engine';
import { getTestDb } from '../../../utils/database';
import { creditApplicationFixtures, creditAssessmentFixtures } from '../../../fixtures/credit';

// Mock external dependencies
vi.mock('../../../utils/database');
vi.mock('@services/sme-integration/src/clients/sme-api-client');

describe('UnderwritingEngine', () => {
  let underwritingEngine: UnderwritingEngine;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      eq: vi.fn(),
    };

    (getTestDb as Mock).mockReturnValue(mockDb);
    
    underwritingEngine = new UnderwritingEngine();
  });

  describe('assessCreditApplication', () => {
    it('should assess a low-risk application', async () => {
      // Arrange
      const application = creditApplicationFixtures.approvedApplication;
      
      // Mock database queries for user data
      mockDb.where.mockResolvedValueOnce([{
        id: 'user-001',
        email: 'test@example.com',
        kycStatus: 'verified',
        creditHistory: {
          score: 780,
          delinquencies: 0,
          bankruptcies: 0,
        },
      }]);

      // Mock business data from SME integration
      const mockBusinessData = {
        revenue: 500000,
        employees: 15,
        yearEstablished: 2018,
        industry: 'Technology',
        creditRating: 'A',
        riskScore: 780,
      };

      // Mock external API calls
      vi.doMock('@services/sme-integration/src/clients/sme-api-client', () => ({
        SmeApiClient: vi.fn().mockImplementation(() => ({
          getBusinessData: vi.fn().mockResolvedValue(mockBusinessData),
          getCreditBureaScore: vi.fn().mockResolvedValue(780),
        })),
      }));

      // Act
      const assessment = await underwritingEngine.assessCreditApplication(application.id);

      // Assert
      expect(assessment.overallScore).toBeGreaterThan(700);
      expect(assessment.riskLevel).toBe('low');
      expect(assessment.recommendedAction).toBe('approve');
      expect(assessment.maxRecommendedAmount).toBeGreaterThan(application.amount);
      expect(assessment.factors.creditHistory.score).toBeGreaterThan(70);
      expect(assessment.factors.financialStability.score).toBeGreaterThan(70);
    });

    it('should assess a high-risk application', async () => {
      // Arrange
      const application = creditApplicationFixtures.rejectedApplication;
      
      // Mock database queries for user data with poor credit
      mockDb.where.mockResolvedValueOnce([{
        id: 'user-002',
        email: 'highrisk@example.com',
        kycStatus: 'verified',
        creditHistory: {
          score: 520,
          delinquencies: 3,
          bankruptcies: 1,
          collections: 2,
        },
      }]);

      // Mock poor business data
      const mockBusinessData = {
        revenue: 150000,
        employees: 3,
        yearEstablished: 2023, // Very new business
        industry: 'Hospitality', // Higher risk industry
        creditRating: 'C+',
        riskScore: 450,
        warnings: ['Declining revenue', 'High debt levels'],
      };

      // Mock external API calls
      vi.doMock('@services/sme-integration/src/clients/sme-api-client', () => ({
        SmeApiClient: vi.fn().mockImplementation(() => ({
          getBusinessData: vi.fn().mockResolvedValue(mockBusinessData),
          getCreditBureaScore: vi.fn().mockResolvedValue(520),
        })),
      }));

      // Act
      const assessment = await underwritingEngine.assessCreditApplication(application.id);

      // Assert
      expect(assessment.overallScore).toBeLessThan(600);
      expect(assessment.riskLevel).toBe('high');
      expect(assessment.recommendedAction).toBe('reject');
      expect(assessment.maxRecommendedAmount).toBe(0);
      expect(assessment.redFlags).toBeDefined();
      expect(assessment.redFlags!.length).toBeGreaterThan(0);
    });

    it('should assess a medium-risk application with conditions', async () => {
      // Arrange
      const application = creditApplicationFixtures.underReviewApplication;
      
      // Mock database queries for user data with moderate credit
      mockDb.where.mockResolvedValueOnce([{
        id: 'user-002',
        email: 'moderate@example.com',
        kycStatus: 'verified',
        creditHistory: {
          score: 680,
          delinquencies: 1,
          bankruptcies: 0,
        },
      }]);

      // Mock moderate business data
      const mockBusinessData = {
        revenue: 300000,
        employees: 8,
        yearEstablished: 2020,
        industry: 'Retail',
        creditRating: 'B+',
        riskScore: 650,
      };

      // Mock external API calls
      vi.doMock('@services/sme-integration/src/clients/sme-api-client', () => ({
        SmeApiClient: vi.fn().mockImplementation(() => ({
          getBusinessData: vi.fn().mockResolvedValue(mockBusinessData),
          getCreditBureaScore: vi.fn().mockResolvedValue(680),
        })),
      }));

      // Act
      const assessment = await underwritingEngine.assessCreditApplication(application.id);

      // Assert
      expect(assessment.overallScore).toBeGreaterThan(600);
      expect(assessment.overallScore).toBeLessThan(750);
      expect(assessment.riskLevel).toBe('medium');
      expect(assessment.recommendedAction).toBe('conditional_approve');
      expect(assessment.conditions).toBeDefined();
      expect(assessment.conditions!.length).toBeGreaterThan(0);
      expect(assessment.maxRecommendedAmount).toBeLessThan(application.amount);
    });

    it('should handle missing application', async () => {
      // Arrange
      const nonExistentId = 'non-existent-app';
      
      // Mock database query to return no application
      mockDb.where.mockResolvedValue([]);

      // Act & Assert
      await expect(underwritingEngine.assessCreditApplication(nonExistentId))
        .rejects.toThrow('Application not found');
    });

    it('should handle missing user data', async () => {
      // Arrange
      const application = creditApplicationFixtures.pendingApplication;
      
      // Mock database query to return application but no user
      mockDb.where
        .mockResolvedValueOnce([application]) // Application found
        .mockResolvedValueOnce([]); // User not found

      // Act & Assert
      await expect(underwritingEngine.assessCreditApplication(application.id))
        .rejects.toThrow('User not found');
    });

    it('should handle external service failures gracefully', async () => {
      // Arrange
      const application = creditApplicationFixtures.pendingApplication;
      
      // Mock database queries
      mockDb.where.mockResolvedValueOnce([{
        id: 'user-001',
        email: 'test@example.com',
        kycStatus: 'verified',
        creditHistory: {
          score: 750,
          delinquencies: 0,
        },
      }]);

      // Mock external service failure
      vi.doMock('@services/sme-integration/src/clients/sme-api-client', () => ({
        SmeApiClient: vi.fn().mockImplementation(() => ({
          getBusinessData: vi.fn().mockRejectedValue(new Error('External service unavailable')),
          getCreditBureaScore: vi.fn().mockResolvedValue(750),
        })),
      }));

      // Act
      const assessment = await underwritingEngine.assessCreditApplication(application.id);

      // Assert - Should still provide assessment with available data
      expect(assessment.overallScore).toBeGreaterThan(0);
      expect(assessment.riskLevel).toBeDefined();
      expect(assessment.externalScores.businessRating).toBe('Unable to retrieve');
    });
  });

  describe('calculateCreditScore', () => {
    it('should calculate score with all factors', () => {
      // Arrange
      const factors = {
        creditHistory: { score: 85, weight: 0.35 },
        financialStability: { score: 80, weight: 0.25 },
        businessPerformance: { score: 75, weight: 0.20 },
        debtToIncomeRatio: { score: 70, weight: 0.15 },
        industryRisk: { score: 65, weight: 0.05 },
      };

      // Act
      const score = (underwritingEngine as any).calculateCreditScore(factors);

      // Assert
      const expectedScore = (85 * 0.35) + (80 * 0.25) + (75 * 0.20) + (70 * 0.15) + (65 * 0.05);
      expect(score).toBe(Math.round(expectedScore));
    });

    it('should handle missing factors gracefully', () => {
      // Arrange
      const factors = {
        creditHistory: { score: 85, weight: 0.35 },
        financialStability: { score: 80, weight: 0.25 },
        // Missing other factors
      };

      // Act
      const score = (underwritingEngine as any).calculateCreditScore(factors);

      // Assert
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1000);
    });
  });

  describe('determineRiskLevel', () => {
    it('should classify low risk correctly', () => {
      const riskLevel = (underwritingEngine as any).determineRiskLevel(800);
      expect(riskLevel).toBe('low');
    });

    it('should classify medium risk correctly', () => {
      const riskLevel = (underwritingEngine as any).determineRiskLevel(680);
      expect(riskLevel).toBe('medium');
    });

    it('should classify high risk correctly', () => {
      const riskLevel = (underwritingEngine as any).determineRiskLevel(550);
      expect(riskLevel).toBe('high');
    });

    it('should handle edge cases', () => {
      expect((underwritingEngine as any).determineRiskLevel(700)).toBe('low');
      expect((underwritingEngine as any).determineRiskLevel(600)).toBe('medium');
      expect((underwritingEngine as any).determineRiskLevel(599)).toBe('high');
    });
  });

  describe('generateRecommendedAction', () => {
    it('should recommend approval for low risk', () => {
      const action = (underwritingEngine as any).generateRecommendedAction('low', 800);
      expect(action).toBe('approve');
    });

    it('should recommend conditional approval for medium risk', () => {
      const action = (underwritingEngine as any).generateRecommendedAction('medium', 650);
      expect(action).toBe('conditional_approve');
    });

    it('should recommend rejection for high risk', () => {
      const action = (underwritingEngine as any).generateRecommendedAction('high', 500);
      expect(action).toBe('reject');
    });
  });

  describe('calculateMaxRecommendedAmount', () => {
    it('should recommend full amount for excellent applications', () => {
      const amount = (underwritingEngine as any).calculateMaxRecommendedAmount(
        25000, // requested
        800,   // score
        'low'  // risk level
      );
      expect(amount).toBe(25000);
    });

    it('should recommend reduced amount for medium risk', () => {
      const amount = (underwritingEngine as any).calculateMaxRecommendedAmount(
        25000,   // requested
        650,     // score
        'medium' // risk level
      );
      expect(amount).toBeLessThan(25000);
      expect(amount).toBeGreaterThan(0);
    });

    it('should recommend zero for high risk', () => {
      const amount = (underwritingEngine as any).calculateMaxRecommendedAmount(
        25000, // requested
        500,   // score
        'high' // risk level
      );
      expect(amount).toBe(0);
    });

    it('should cap at maximum lending limit', () => {
      const amount = (underwritingEngine as any).calculateMaxRecommendedAmount(
        1000000, // very high request
        850,     // excellent score
        'low'    // low risk
      );
      expect(amount).toBeLessThanOrEqual(500000); // Assuming max limit
    });
  });

  describe('generateConditions', () => {
    it('should generate appropriate conditions for medium risk', () => {
      const conditions = (underwritingEngine as any).generateConditions('medium', 650, {
        debtToIncomeRatio: { score: 60 },
        financialStability: { score: 65 },
      });

      expect(conditions).toBeInstanceOf(Array);
      expect(conditions.length).toBeGreaterThan(0);
      expect(conditions).toContain(expect.stringContaining('guarantee')); // Personal guarantee likely required
    });

    it('should generate stricter conditions for lower scores', () => {
      const conditions = (underwritingEngine as any).generateConditions('medium', 620, {
        debtToIncomeRatio: { score: 50 },
        businessPerformance: { score: 55 },
      });

      expect(conditions.length).toBeGreaterThan(2);
      expect(conditions).toContain(expect.stringContaining('collateral'));
    });

    it('should return empty conditions for low risk', () => {
      const conditions = (underwritingEngine as any).generateConditions('low', 800, {});
      expect(conditions).toEqual([]);
    });
  });

  describe('identifyRedFlags', () => {
    it('should identify credit history red flags', () => {
      const userData = {
        creditHistory: {
          bankruptcies: 1,
          collections: 3,
          delinquencies: 5,
        },
      };

      const redFlags = (underwritingEngine as any).identifyRedFlags(userData, {});
      
      expect(redFlags).toContain('Previous bankruptcy filing');
      expect(redFlags).toContain('Multiple collection accounts');
      expect(redFlags).toContain('Recent payment delinquencies');
    });

    it('should identify business red flags', () => {
      const businessData = {
        revenue: 50000, // Very low revenue
        yearEstablished: 2024, // Very new
        warnings: ['Declining revenue', 'Cash flow issues'],
      };

      const redFlags = (underwritingEngine as any).identifyRedFlags({}, businessData);
      
      expect(redFlags).toContain('Very new business (less than 2 years)');
      expect(redFlags).toContain('Low annual revenue');
      expect(redFlags).toContain('Declining revenue');
    });

    it('should return empty array for clean records', () => {
      const userData = {
        creditHistory: {
          bankruptcies: 0,
          collections: 0,
          delinquencies: 0,
        },
      };

      const businessData = {
        revenue: 500000,
        yearEstablished: 2018,
        warnings: [],
      };

      const redFlags = (underwritingEngine as any).identifyRedFlags(userData, businessData);
      expect(redFlags).toEqual([]);
    });
  });

  describe('assessCreditHistory', () => {
    it('should score excellent credit history highly', () => {
      const creditHistory = {
        score: 800,
        delinquencies: 0,
        bankruptcies: 0,
        collections: 0,
        accountsInGoodStanding: 5,
      };

      const assessment = (underwritingEngine as any).assessCreditHistory(creditHistory);
      
      expect(assessment.score).toBeGreaterThan(80);
      expect(assessment.details).toContain('Excellent');
    });

    it('should score poor credit history lowly', () => {
      const creditHistory = {
        score: 500,
        delinquencies: 5,
        bankruptcies: 1,
        collections: 3,
      };

      const assessment = (underwritingEngine as any).assessCreditHistory(creditHistory);
      
      expect(assessment.score).toBeLessThan(50);
      expect(assessment.details).toContain('multiple');
    });
  });

  describe('assessFinancialStability', () => {
    it('should assess stable finances positively', () => {
      const businessData = {
        revenue: 500000,
        revenueGrowth: 0.15, // 15% growth
        cashFlow: 50000,
        profitMargin: 0.12, // 12% margin
      };

      const assessment = (underwritingEngine as any).assessFinancialStability(businessData);
      
      expect(assessment.score).toBeGreaterThan(70);
      expect(assessment.details).toContain('Strong');
    });

    it('should assess unstable finances poorly', () => {
      const businessData = {
        revenue: 100000,
        revenueGrowth: -0.20, // 20% decline
        cashFlow: -10000, // Negative cash flow
        profitMargin: -0.05, // Negative margin
      };

      const assessment = (underwritingEngine as any).assessFinancialStability(businessData);
      
      expect(assessment.score).toBeLessThan(40);
      expect(assessment.details).toContain('volatile');
    });
  });
});