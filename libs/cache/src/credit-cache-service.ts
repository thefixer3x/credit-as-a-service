import pino from 'pino';
import { CacheService } from './cache-service.js';

const logger = pino({ name: 'credit-cache-service' });

export interface CreditScore {
  userId: string;
  score: number;
  riskRating: 'low' | 'medium' | 'high';
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }>;
  calculatedAt: Date;
  validUntil: Date;
  source: string;
  model: string;
  version: string;
}

export interface CreditApplication {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_review' | 'completed';
  amount: number;
  term: number;
  interestRate?: number;
  creditScore?: number;
  riskAssessment?: {
    score: number;
    factors: string[];
    recommendation: 'approve' | 'reject' | 'review';
  };
  submittedAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface CreditLimit {
  userId: string;
  totalLimit: number;
  availableLimit: number;
  usedLimit: number;
  status: 'active' | 'suspended' | 'frozen';
  lastUpdated: Date;
  expiresAt?: Date;
}

export class CreditCacheService {
  private cache: CacheService;
  private readonly CREDIT_SCORE_TTL = 12 * 60 * 60; // 12 hours
  private readonly CREDIT_APPLICATION_TTL = 24 * 60 * 60; // 24 hours
  private readonly CREDIT_LIMIT_TTL = 30 * 60; // 30 minutes
  private readonly UNDERWRITING_RESULT_TTL = 7 * 24 * 60 * 60; // 7 days
  private readonly RISK_ASSESSMENT_TTL = 6 * 60 * 60; // 6 hours

  constructor(cache: CacheService) {
    this.cache = cache;
  }

  /**
   * Cache credit score with automatic TTL based on freshness
   */
  async setCreditScore(creditScore: CreditScore): Promise<boolean> {
    try {
      const key = this.getCreditScoreKey(creditScore.userId);
      
      // Determine TTL based on score age and validity
      const now = new Date();
      const ageInHours = (now.getTime() - creditScore.calculatedAt.getTime()) / (1000 * 60 * 60);
      const validityHours = (creditScore.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Use shorter of remaining validity or default TTL
      const ttl = Math.min(Math.max(validityHours, 1), this.CREDIT_SCORE_TTL);
      
      const success = await this.cache.set(key, creditScore, ttl);
      
      if (success) {
        // Also cache by score range for analytics
        await this.cacheScoreRange(creditScore);
        
        // Cache risk rating lookup
        await this.cacheRiskRating(creditScore.userId, creditScore.riskRating);
        
        logger.info({ 
          userId: creditScore.userId, 
          score: creditScore.score, 
          ttl,
          validityHours 
        }, 'Credit score cached');
      }
      
      return success;
    } catch (error) {
      logger.error({ error, userId: creditScore.userId }, 'Failed to cache credit score');
      return false;
    }
  }

  /**
   * Get cached credit score
   */
  async getCreditScore(userId: string): Promise<CreditScore | null> {
    try {
      const key = this.getCreditScoreKey(userId);
      const creditScore = await this.cache.get<CreditScore>(key);
      
      if (creditScore) {
        // Check if score is still valid
        if (new Date(creditScore.validUntil) > new Date()) {
          return creditScore;
        } else {
          // Score expired, remove from cache
          await this.cache.del(key);
          return null;
        }
      }
      
      return null;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get cached credit score');
      return null;
    }
  }

  /**
   * Cache credit application with status-specific TTL
   */
  async setCreditApplication(application: CreditApplication): Promise<boolean> {
    try {
      const key = this.getCreditApplicationKey(application.id);
      
      // Adjust TTL based on status
      let ttl = this.CREDIT_APPLICATION_TTL;
      switch (application.status) {
        case 'pending':
          ttl = 2 * 60 * 60; // 2 hours for pending (short for real-time updates)
          break;
        case 'in_review':
          ttl = 4 * 60 * 60; // 4 hours for in review
          break;
        case 'approved':
        case 'rejected':
          ttl = 7 * 24 * 60 * 60; // 7 days for final statuses
          break;
        case 'completed':
          ttl = 30 * 24 * 60 * 60; // 30 days for completed
          break;
      }
      
      const success = await this.cache.set(key, application, ttl);
      
      if (success) {
        // Cache by user for quick lookup
        await this.cacheUserApplication(application.userId, application.id);
        
        // Cache by status for admin dashboards
        await this.cacheApplicationByStatus(application.status, application.id);
        
        logger.debug({ 
          applicationId: application.id, 
          userId: application.userId, 
          status: application.status,
          ttl 
        }, 'Credit application cached');
      }
      
      return success;
    } catch (error) {
      logger.error({ error, applicationId: application.id }, 'Failed to cache credit application');
      return false;
    }
  }

  /**
   * Get cached credit application
   */
  async getCreditApplication(applicationId: string): Promise<CreditApplication | null> {
    try {
      const key = this.getCreditApplicationKey(applicationId);
      return await this.cache.get<CreditApplication>(key);
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to get cached credit application');
      return null;
    }
  }

  /**
   * Cache user's credit limit
   */
  async setCreditLimit(creditLimit: CreditLimit): Promise<boolean> {
    try {
      const key = this.getCreditLimitKey(creditLimit.userId);
      
      const success = await this.cache.set(key, creditLimit, this.CREDIT_LIMIT_TTL);
      
      if (success) {
        logger.debug({ 
          userId: creditLimit.userId, 
          totalLimit: creditLimit.totalLimit,
          availableLimit: creditLimit.availableLimit,
          status: creditLimit.status
        }, 'Credit limit cached');
      }
      
      return success;
    } catch (error) {
      logger.error({ error, userId: creditLimit.userId }, 'Failed to cache credit limit');
      return false;
    }
  }

  /**
   * Get cached credit limit
   */
  async getCreditLimit(userId: string): Promise<CreditLimit | null> {
    try {
      const key = this.getCreditLimitKey(userId);
      return await this.cache.get<CreditLimit>(key);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get cached credit limit');
      return null;
    }
  }

  /**
   * Cache underwriting result
   */
  async setUnderwritingResult(
    applicationId: string, 
    result: {
      decision: 'approve' | 'reject' | 'review';
      confidence: number;
      reasons: string[];
      recommendedAmount?: number;
      recommendedRate?: number;
      conditions?: string[];
      processedAt: Date;
    }
  ): Promise<boolean> {
    try {
      const key = this.getUnderwritingResultKey(applicationId);
      return await this.cache.set(key, result, this.UNDERWRITING_RESULT_TTL);
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to cache underwriting result');
      return false;
    }
  }

  /**
   * Get cached underwriting result
   */
  async getUnderwritingResult(applicationId: string): Promise<any> {
    try {
      const key = this.getUnderwritingResultKey(applicationId);
      return await this.cache.get(key);
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to get cached underwriting result');
      return null;
    }
  }

  /**
   * Cache risk assessment
   */
  async setRiskAssessment(
    userId: string,
    assessment: {
      score: number;
      category: 'low' | 'medium' | 'high' | 'very_high';
      factors: Array<{
        name: string;
        score: number;
        impact: string;
      }>;
      recommendations: string[];
      assessedAt: Date;
    }
  ): Promise<boolean> {
    try {
      const key = this.getRiskAssessmentKey(userId);
      return await this.cache.set(key, assessment, this.RISK_ASSESSMENT_TTL);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to cache risk assessment');
      return false;
    }
  }

  /**
   * Get cached risk assessment
   */
  async getRiskAssessment(userId: string): Promise<any> {
    try {
      const key = this.getRiskAssessmentKey(userId);
      return await this.cache.get(key);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get cached risk assessment');
      return null;
    }
  }

  /**
   * Get user's applications from cache
   */
  async getUserApplications(userId: string): Promise<string[]> {
    try {
      const key = this.getUserApplicationsKey(userId);
      return await this.cache.smembers(key);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user applications from cache');
      return [];
    }
  }

  /**
   * Get applications by status from cache
   */
  async getApplicationsByStatus(status: string): Promise<string[]> {
    try {
      const key = this.getApplicationsByStatusKey(status);
      return await this.cache.smembers(key);
    } catch (error) {
      logger.error({ error, status }, 'Failed to get applications by status from cache');
      return [];
    }
  }

  /**
   * Invalidate all cache entries for a user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const keys = [
        this.getCreditScoreKey(userId),
        this.getCreditLimitKey(userId),
        this.getRiskAssessmentKey(userId),
        this.getUserApplicationsKey(userId),
        this.getRiskRatingKey(userId)
      ];
      
      await this.cache.mdel(keys);
      logger.info({ userId, invalidatedKeys: keys.length }, 'User credit cache invalidated');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to invalidate user credit cache');
    }
  }

  /**
   * Invalidate application cache
   */
  async invalidateApplicationCache(applicationId: string): Promise<void> {
    try {
      const keys = [
        this.getCreditApplicationKey(applicationId),
        this.getUnderwritingResultKey(applicationId)
      ];
      
      await this.cache.mdel(keys);
      logger.info({ applicationId, invalidatedKeys: keys.length }, 'Application cache invalidated');
    } catch (error) {
      logger.error({ error, applicationId }, 'Failed to invalidate application cache');
    }
  }

  /**
   * Get cache statistics for credit module
   */
  async getCreditCacheStats(): Promise<{
    creditScores: number;
    applications: number;
    creditLimits: number;
    underwritingResults: number;
    riskAssessments: number;
  }> {
    try {
      // This would require Redis SCAN in production for accurate counts
      return {
        creditScores: 0,
        applications: 0,
        creditLimits: 0,
        underwritingResults: 0,
        riskAssessments: 0
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get credit cache stats');
      return {
        creditScores: 0,
        applications: 0,
        creditLimits: 0,
        underwritingResults: 0,
        riskAssessments: 0
      };
    }
  }

  // Private helper methods for cache keys
  private getCreditScoreKey(userId: string): string {
    return `credit:score:${userId}`;
  }

  private getCreditApplicationKey(applicationId: string): string {
    return `credit:application:${applicationId}`;
  }

  private getCreditLimitKey(userId: string): string {
    return `credit:limit:${userId}`;
  }

  private getUnderwritingResultKey(applicationId: string): string {
    return `credit:underwriting:${applicationId}`;
  }

  private getRiskAssessmentKey(userId: string): string {
    return `credit:risk:${userId}`;
  }

  private getUserApplicationsKey(userId: string): string {
    return `credit:user_apps:${userId}`;
  }

  private getApplicationsByStatusKey(status: string): string {
    return `credit:apps_by_status:${status}`;
  }

  private getScoreRangeKey(range: string): string {
    return `credit:score_range:${range}`;
  }

  private getRiskRatingKey(userId: string): string {
    return `credit:risk_rating:${userId}`;
  }

  // Private helper methods for secondary caching
  private async cacheScoreRange(creditScore: CreditScore): Promise<void> {
    try {
      const range = this.getScoreRange(creditScore.score);
      const key = this.getScoreRangeKey(range);
      await this.cache.sadd(key, [creditScore.userId]);
      await this.cache.expire(key, this.CREDIT_SCORE_TTL);
    } catch (error) {
      logger.error({ error }, 'Failed to cache score range');
    }
  }

  private async cacheRiskRating(userId: string, riskRating: string): Promise<void> {
    try {
      const key = this.getRiskRatingKey(userId);
      await this.cache.set(key, riskRating, this.CREDIT_SCORE_TTL);
    } catch (error) {
      logger.error({ error }, 'Failed to cache risk rating');
    }
  }

  private async cacheUserApplication(userId: string, applicationId: string): Promise<void> {
    try {
      const key = this.getUserApplicationsKey(userId);
      await this.cache.sadd(key, [applicationId]);
      await this.cache.expire(key, this.CREDIT_APPLICATION_TTL);
    } catch (error) {
      logger.error({ error }, 'Failed to cache user application');
    }
  }

  private async cacheApplicationByStatus(status: string, applicationId: string): Promise<void> {
    try {
      const key = this.getApplicationsByStatusKey(status);
      await this.cache.sadd(key, [applicationId]);
      await this.cache.expire(key, this.CREDIT_APPLICATION_TTL);
    } catch (error) {
      logger.error({ error }, 'Failed to cache application by status');
    }
  }

  private getScoreRange(score: number): string {
    if (score >= 800) return '800+';
    if (score >= 750) return '750-799';
    if (score >= 700) return '700-749';
    if (score >= 650) return '650-699';
    if (score >= 600) return '600-649';
    if (score >= 550) return '550-599';
    return '<550';
  }
}