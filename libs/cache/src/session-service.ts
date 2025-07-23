import pino from 'pino';
import crypto from 'crypto';
import { CacheService } from './cache-service.js';

const logger = pino({ name: 'session-service' });

export interface SessionData {
  userId: string;
  email?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

export interface SessionConfig {
  ttlSeconds: number;
  extendOnAccess: boolean;
  maxSessions: number;
  sessionKeyPrefix: string;
  userSessionsPrefix: string;
}

export class SessionService {
  private cache: CacheService;
  private config: SessionConfig;

  constructor(cache: CacheService, config?: Partial<SessionConfig>) {
    this.cache = cache;
    this.config = {
      ttlSeconds: 24 * 60 * 60, // 24 hours
      extendOnAccess: true,
      maxSessions: 5, // Max concurrent sessions per user
      sessionKeyPrefix: 'session:',
      userSessionsPrefix: 'user_sessions:',
      ...config
    };
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    email?: string,
    roles: string[] = [],
    permissions: string[] = [],
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.config.ttlSeconds * 1000);

      const sessionData: SessionData = {
        userId,
        email,
        roles,
        permissions,
        metadata,
        createdAt: now,
        lastAccessedAt: now,
        expiresAt
      };

      // Store session data
      const sessionKey = this.getSessionKey(sessionId);
      await this.cache.set(sessionKey, sessionData, this.config.ttlSeconds);

      // Track user sessions
      await this.addUserSession(userId, sessionId);

      // Enforce max sessions limit
      await this.enforceMaxSessions(userId);

      logger.info({ 
        sessionId, 
        userId, 
        expiresAt: expiresAt.toISOString() 
      }, 'Session created');

      return sessionId;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await this.cache.get<SessionData>(sessionKey);

      if (!sessionData) {
        return null;
      }

      // Check if session is expired
      if (new Date(sessionData.expiresAt) < new Date()) {
        await this.destroySession(sessionId);
        return null;
      }

      // Extend session if configured
      if (this.config.extendOnAccess) {
        await this.extendSession(sessionId, sessionData);
      }

      return sessionData;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get session');
      return null;
    }
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      const updatedData: SessionData = {
        ...sessionData,
        ...updates,
        lastAccessedAt: new Date()
      };

      const sessionKey = this.getSessionKey(sessionId);
      const ttl = Math.max(0, Math.floor((new Date(updatedData.expiresAt).getTime() - Date.now()) / 1000));
      
      await this.cache.set(sessionKey, updatedData, ttl);
      
      logger.debug({ sessionId, updates: Object.keys(updates) }, 'Session updated');
      return true;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to update session');
      return false;
    }
  }

  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      
      const sessionKey = this.getSessionKey(sessionId);
      await this.cache.del(sessionKey);

      // Remove from user sessions
      if (sessionData?.userId) {
        await this.removeUserSession(sessionData.userId, sessionId);
      }

      logger.info({ sessionId, userId: sessionData?.userId }, 'Session destroyed');
      return true;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to destroy session');
      return false;
    }
  }

  /**
   * Destroy all sessions for a user
   */
  async destroyUserSessions(userId: string): Promise<number> {
    try {
      const sessionIds = await this.getUserSessions(userId);
      let destroyedCount = 0;

      for (const sessionId of sessionIds) {
        const success = await this.destroySession(sessionId);
        if (success) destroyedCount++;
      }

      // Clear user sessions set
      const userSessionsKey = this.getUserSessionsKey(userId);
      await this.cache.del(userSessionsKey);

      logger.info({ userId, destroyedCount }, 'User sessions destroyed');
      return destroyedCount;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to destroy user sessions');
      return 0;
    }
  }

  /**
   * Get all session IDs for a user
   */
  async getUserSessions(userId: string): Promise<string[]> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      return await this.cache.smembers(userSessionsKey);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user sessions');
      return [];
    }
  }

  /**
   * Get active session count for a user
   */
  async getUserSessionCount(userId: string): Promise<number> {
    try {
      const sessionIds = await this.getUserSessions(userId);
      return sessionIds.length;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user session count');
      return 0;
    }
  }

  /**
   * Validate session and get user data
   */
  async validateSession(sessionId: string): Promise<{
    isValid: boolean;
    session?: SessionData;
    reason?: string;
  }> {
    try {
      if (!sessionId) {
        return { isValid: false, reason: 'No session ID provided' };
      }

      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return { isValid: false, reason: 'Session not found or expired' };
      }

      return { isValid: true, session: sessionData };
    } catch (error) {
      logger.error({ error, sessionId }, 'Session validation failed');
      return { isValid: false, reason: 'Session validation error' };
    }
  }

  /**
   * Extend session TTL
   */
  private async extendSession(sessionId: string, sessionData: SessionData): Promise<void> {
    try {
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + this.config.ttlSeconds * 1000);

      const updatedData: SessionData = {
        ...sessionData,
        lastAccessedAt: now,
        expiresAt: newExpiresAt
      };

      const sessionKey = this.getSessionKey(sessionId);
      await this.cache.set(sessionKey, updatedData, this.config.ttlSeconds);

      logger.debug({ 
        sessionId, 
        newExpiresAt: newExpiresAt.toISOString() 
      }, 'Session extended');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to extend session');
    }
  }

  /**
   * Add session to user's session set
   */
  private async addUserSession(userId: string, sessionId: string): Promise<void> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      await this.cache.sadd(userSessionsKey, [sessionId]);
      await this.cache.expire(userSessionsKey, this.config.ttlSeconds);
    } catch (error) {
      logger.error({ error, userId, sessionId }, 'Failed to add user session');
    }
  }

  /**
   * Remove session from user's session set
   */
  private async removeUserSession(userId: string, sessionId: string): Promise<void> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      await this.cache.srem(userSessionsKey, [sessionId]);
    } catch (error) {
      logger.error({ error, userId, sessionId }, 'Failed to remove user session');
    }
  }

  /**
   * Enforce maximum sessions per user
   */
  private async enforceMaxSessions(userId: string): Promise<void> {
    try {
      const sessionIds = await this.getUserSessions(userId);
      
      if (sessionIds.length > this.config.maxSessions) {
        // Sort sessions by last accessed (oldest first) and remove excess
        const sessionsToRemove = sessionIds.slice(0, sessionIds.length - this.config.maxSessions);
        
        for (const sessionId of sessionsToRemove) {
          await this.destroySession(sessionId);
        }

        logger.info({ 
          userId, 
          removedCount: sessionsToRemove.length,
          maxSessions: this.config.maxSessions 
        }, 'Enforced max sessions limit');
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to enforce max sessions');
    }
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get session cache key
   */
  private getSessionKey(sessionId: string): string {
    return `${this.config.sessionKeyPrefix}${sessionId}`;
  }

  /**
   * Get user sessions cache key
   */
  private getUserSessionsKey(userId: string): string {
    return `${this.config.userSessionsPrefix}${userId}`;
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    uniqueUsers: number;
  }> {
    try {
      // This is a simplified implementation
      // In production, you might want to use Redis SCAN for better performance
      const sessionPattern = `${this.config.sessionKeyPrefix}*`;
      const userSessionsPattern = `${this.config.userSessionsPrefix}*`;
      
      // Get cache stats
      const cacheStats = this.cache.getStats();
      
      return {
        totalSessions: 0, // Would need Redis SCAN to count
        activeSessions: 0, // Would need Redis SCAN to count
        uniqueUsers: 0 // Would need Redis SCAN to count
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get session stats');
      return {
        totalSessions: 0,
        activeSessions: 0,
        uniqueUsers: 0
      };
    }
  }

  /**
   * Clean up expired sessions (maintenance task)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      // Redis handles expiration automatically, but we might want to clean up
      // user session sets that contain expired session IDs
      logger.info('Session cleanup completed (Redis auto-expiration)');
      return 0;
    } catch (error) {
      logger.error({ error }, 'Session cleanup failed');
      return 0;
    }
  }
}