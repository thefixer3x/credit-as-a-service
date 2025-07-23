import pino from 'pino';
import { CacheService } from './cache-service.js';
import { RedisClient } from './redis-client.js';

const logger = pino({ name: 'cache-invalidation-service' });

export interface InvalidationEvent {
  id: string;
  type: 'key' | 'pattern' | 'tag' | 'user' | 'tenant' | 'custom';
  target: string | string[];
  reason: string;
  source: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface InvalidationRule {
  name: string;
  trigger: {
    event: string;
    condition?: (data: any) => boolean;
  };
  targets: Array<{
    type: 'key' | 'pattern' | 'tag';
    value: string;
  }>;
  delay?: number; // seconds
  enabled: boolean;
}

export interface InvalidationStats {
  totalInvalidations: number;
  invalidationsByType: Record<string, number>;
  invalidationsBySource: Record<string, number>;
  averageInvalidationTime: number;
  failedInvalidations: number;
}

export class CacheInvalidationService {
  private cache: CacheService;
  private redisClient: RedisClient;
  private invalidationRules: Map<string, InvalidationRule> = new Map();
  private pendingInvalidations: Map<string, NodeJS.Timeout> = new Map();
  private stats: InvalidationStats = {
    totalInvalidations: 0,
    invalidationsByType: {},
    invalidationsBySource: {},
    averageInvalidationTime: 0,
    failedInvalidations: 0
  };

  private readonly INVALIDATION_CHANNEL = 'cache:invalidation';
  private readonly STATS_KEY = 'cache:invalidation:stats';

  constructor(cache: CacheService, redisClient: RedisClient) {
    this.cache = cache;
    this.redisClient = redisClient;
    this.setupInvalidationRules();
    this.subscribeToInvalidationEvents();
  }

  /**
   * Setup default invalidation rules
   */
  private setupInvalidationRules(): void {
    const defaultRules: InvalidationRule[] = [
      {
        name: 'user-data-update',
        trigger: {
          event: 'user.updated',
          condition: (data) => data.userId !== undefined
        },
        targets: [
          { type: 'pattern', value: 'user:${userId}:*' },
          { type: 'pattern', value: 'session:*:${userId}' },
          { type: 'tag', value: 'user-${userId}' }
        ],
        enabled: true
      },
      {
        name: 'credit-score-update',
        trigger: {
          event: 'credit.score.updated'
        },
        targets: [
          { type: 'pattern', value: 'credit:score:${userId}' },
          { type: 'pattern', value: 'credit:risk:${userId}' },
          { type: 'tag', value: 'credit-${userId}' }
        ],
        enabled: true
      },
      {
        name: 'application-status-change',
        trigger: {
          event: 'application.status.changed'
        },
        targets: [
          { type: 'key', value: 'credit:application:${applicationId}' },
          { type: 'pattern', value: 'credit:user_apps:${userId}' },
          { type: 'tag', value: 'application-${applicationId}' }
        ],
        enabled: true
      },
      {
        name: 'session-invalidation',
        trigger: {
          event: 'auth.logout'
        },
        targets: [
          { type: 'key', value: 'session:${sessionId}' },
          { type: 'pattern', value: 'user_sessions:${userId}' }
        ],
        enabled: true
      },
      {
        name: 'api-cache-invalidation',
        trigger: {
          event: 'api.data.changed'
        },
        targets: [
          { type: 'pattern', value: 'api_cache:*${endpoint}*' }
        ],
        delay: 5, // 5 second delay to allow for eventual consistency
        enabled: true
      }
    ];

    defaultRules.forEach(rule => {
      this.invalidationRules.set(rule.name, rule);
    });
  }

  /**
   * Subscribe to invalidation events
   */
  private async subscribeToInvalidationEvents(): Promise<void> {
    try {
      const subscriber = this.redisClient.getSubscriber();
      
      await subscriber.subscribe(this.INVALIDATION_CHANNEL);
      
      subscriber.on('message', async (channel: string, message: string) => {
        if (channel === this.INVALIDATION_CHANNEL) {
          try {
            const event: InvalidationEvent = JSON.parse(message);
            await this.handleInvalidationEvent(event);
          } catch (error) {
            logger.error({ error, message }, 'Failed to parse invalidation event');
          }
        }
      });

      logger.info({ channel: this.INVALIDATION_CHANNEL }, 'Subscribed to invalidation events');
    } catch (error) {
      logger.error({ error }, 'Failed to subscribe to invalidation events');
    }
  }

  /**
   * Invalidate cache by key
   */
  async invalidateByKey(key: string | string[], reason: string, source: string = 'manual'): Promise<boolean> {
    try {
      const startTime = Date.now();
      const keys = Array.isArray(key) ? key : [key];
      
      const deletedCount = await this.cache.mdel(keys);
      const success = deletedCount > 0;

      const event: InvalidationEvent = {
        id: this.generateEventId(),
        type: 'key',
        target: keys,
        reason,
        source,
        timestamp: new Date(),
        metadata: { deletedCount }
      };

      await this.publishInvalidationEvent(event);
      await this.updateStats('key', source, Date.now() - startTime, success);

      logger.info({
        keys: keys.length,
        deletedCount,
        reason,
        source
      }, 'Cache invalidated by key');

      return success;
    } catch (error) {
      logger.error({ error, key, reason }, 'Failed to invalidate cache by key');
      await this.updateStats('key', source, 0, false);
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string, reason: string, source: string = 'manual'): Promise<number> {
    try {
      const startTime = Date.now();
      const client = this.redisClient.getClient();
      let deletedCount = 0;

      // Use SCAN to find matching keys
      const stream = (client as any).scanStream({
        match: pattern,
        count: 100
      });

      const batches: string[][] = [];
      let currentBatch: string[] = [];

      stream.on('data', (keys: string[]) => {
        currentBatch.push(...keys);
        
        // Process in batches of 1000
        if (currentBatch.length >= 1000) {
          batches.push([...currentBatch]);
          currentBatch = [];
        }
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Add remaining keys
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      // Delete in batches
      for (const batch of batches) {
        if (batch.length > 0) {
          const batchDeleted = await this.cache.mdel(batch);
          deletedCount += batchDeleted;
        }
      }

      const event: InvalidationEvent = {
        id: this.generateEventId(),
        type: 'pattern',
        target: pattern,
        reason,
        source,
        timestamp: new Date(),
        metadata: { deletedCount, pattern }
      };

      await this.publishInvalidationEvent(event);
      await this.updateStats('pattern', source, Date.now() - startTime, true);

      logger.info({
        pattern,
        deletedCount,
        reason,
        source
      }, 'Cache invalidated by pattern');

      return deletedCount;
    } catch (error) {
      logger.error({ error, pattern, reason }, 'Failed to invalidate cache by pattern');
      await this.updateStats('pattern', source, 0, false);
      return 0;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string | string[], reason: string, source: string = 'manual'): Promise<number> {
    try {
      const startTime = Date.now();
      const tagList = Array.isArray(tags) ? tags : [tags];
      let totalDeleted = 0;

      for (const tag of tagList) {
        const tagKey = `cache_tags:${tag}`;
        const taggedKeys = await this.cache.smembers(tagKey);
        
        if (taggedKeys.length > 0) {
          const deletedCount = await this.cache.mdel(taggedKeys);
          totalDeleted += deletedCount;
          
          // Clean up the tag set
          await this.cache.del(tagKey);
        }
      }

      const event: InvalidationEvent = {
        id: this.generateEventId(),
        type: 'tag',
        target: tagList,
        reason,
        source,
        timestamp: new Date(),
        metadata: { deletedCount: totalDeleted, tags: tagList }
      };

      await this.publishInvalidationEvent(event);
      await this.updateStats('tag', source, Date.now() - startTime, true);

      logger.info({
        tags: tagList,
        deletedCount: totalDeleted,
        reason,
        source
      }, 'Cache invalidated by tags');

      return totalDeleted;
    } catch (error) {
      logger.error({ error, tags, reason }, 'Failed to invalidate cache by tags');
      await this.updateStats('tag', source, 0, false);
      return 0;
    }
  }

  /**
   * Invalidate all cache entries for a user
   */
  async invalidateUserCache(userId: string, reason: string, source: string = 'manual'): Promise<number> {
    try {
      const patterns = [
        `user:${userId}:*`,
        `session:*:${userId}`,
        `credit:*:${userId}`,
        `api_cache:*user=${userId}*`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const deleted = await this.invalidateByPattern(pattern, reason, source);
        totalDeleted += deleted;
      }

      // Also invalidate by user tag
      const tagDeleted = await this.invalidateByTags(`user-${userId}`, reason, source);
      totalDeleted += tagDeleted;

      const event: InvalidationEvent = {
        id: this.generateEventId(),
        type: 'user',
        target: userId,
        reason,
        source,
        timestamp: new Date(),
        metadata: { deletedCount: totalDeleted, userId }
      };

      await this.publishInvalidationEvent(event);

      logger.info({
        userId,
        deletedCount: totalDeleted,
        reason,
        source
      }, 'User cache invalidated');

      return totalDeleted;
    } catch (error) {
      logger.error({ error, userId, reason }, 'Failed to invalidate user cache');
      return 0;
    }
  }

  /**
   * Invalidate all cache entries for a tenant
   */
  async invalidateTenantCache(tenantId: string, reason: string, source: string = 'manual'): Promise<number> {
    try {
      const patterns = [
        `tenant:${tenantId}:*`,
        `api_cache:*tenant=${tenantId}*`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const deleted = await this.invalidateByPattern(pattern, reason, source);
        totalDeleted += deleted;
      }

      const event: InvalidationEvent = {
        id: this.generateEventId(),
        type: 'tenant',
        target: tenantId,
        reason,
        source,
        timestamp: new Date(),
        metadata: { deletedCount: totalDeleted, tenantId }
      };

      await this.publishInvalidationEvent(event);

      logger.info({
        tenantId,
        deletedCount: totalDeleted,
        reason,
        source
      }, 'Tenant cache invalidated');

      return totalDeleted;
    } catch (error) {
      logger.error({ error, tenantId, reason }, 'Failed to invalidate tenant cache');
      return 0;
    }
  }

  /**
   * Schedule delayed invalidation
   */
  async scheduleInvalidation(
    type: 'key' | 'pattern' | 'tag' | 'user' | 'tenant',
    target: string,
    delaySeconds: number,
    reason: string,
    source: string = 'scheduled'
  ): Promise<string> {
    try {
      const scheduleId = this.generateEventId();
      
      const timeout = setTimeout(async () => {
        try {
          switch (type) {
            case 'key':
              await this.invalidateByKey(target, reason, source);
              break;
            case 'pattern':
              await this.invalidateByPattern(target, reason, source);
              break;
            case 'tag':
              await this.invalidateByTags(target, reason, source);
              break;
            case 'user':
              await this.invalidateUserCache(target, reason, source);
              break;
            case 'tenant':
              await this.invalidateTenantCache(target, reason, source);
              break;
          }
          
          this.pendingInvalidations.delete(scheduleId);
        } catch (error) {
          logger.error({ error, scheduleId, type, target }, 'Scheduled invalidation failed');
        }
      }, delaySeconds * 1000);

      this.pendingInvalidations.set(scheduleId, timeout);

      logger.info({
        scheduleId,
        type,
        target,
        delaySeconds,
        reason
      }, 'Invalidation scheduled');

      return scheduleId;
    } catch (error) {
      logger.error({ error, type, target }, 'Failed to schedule invalidation');
      throw error;
    }
  }

  /**
   * Cancel scheduled invalidation
   */
  cancelScheduledInvalidation(scheduleId: string): boolean {
    const timeout = this.pendingInvalidations.get(scheduleId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingInvalidations.delete(scheduleId);
      logger.info({ scheduleId }, 'Scheduled invalidation cancelled');
      return true;
    }
    return false;
  }

  /**
   * Add invalidation rule
   */
  addInvalidationRule(rule: InvalidationRule): void {
    this.invalidationRules.set(rule.name, rule);
    logger.info({ rule: rule.name }, 'Invalidation rule added');
  }

  /**
   * Remove invalidation rule
   */
  removeInvalidationRule(name: string): boolean {
    const removed = this.invalidationRules.delete(name);
    if (removed) {
      logger.info({ rule: name }, 'Invalidation rule removed');
    }
    return removed;
  }

  /**
   * Get invalidation rules
   */
  getInvalidationRules(): InvalidationRule[] {
    return Array.from(this.invalidationRules.values());
  }

  /**
   * Trigger invalidation based on event
   */
  async triggerInvalidation(eventType: string, data: any, source: string = 'event'): Promise<void> {
    try {
      const matchingRules = Array.from(this.invalidationRules.values())
        .filter(rule => rule.enabled && rule.trigger.event === eventType)
        .filter(rule => !rule.trigger.condition || rule.trigger.condition(data));

      for (const rule of matchingRules) {
        const invalidationPromises = rule.targets.map(async (target) => {
          const resolvedValue = target.value.replace(/\$\{([^}]+)\}/g, (match, key) => data[key] || match);

          const executeInvalidation = async () => {
            switch (target.type) {
              case 'key':
                return this.invalidateByKey(resolvedValue, `Rule: ${rule.name}`, source);
              case 'pattern':
                return this.invalidateByPattern(resolvedValue, `Rule: ${rule.name}`, source);
              case 'tag':
                return this.invalidateByTags(resolvedValue, `Rule: ${rule.name}`, source);
            }
          };

          if (rule.delay) {
            setTimeout(executeInvalidation, rule.delay * 1000);
          } else {
            await executeInvalidation();
          }
        });

        await Promise.all(invalidationPromises);
      }

      logger.debug({
        eventType,
        matchedRules: matchingRules.length,
        data: Object.keys(data)
      }, 'Invalidation triggered by event');
    } catch (error) {
      logger.error({ error, eventType }, 'Failed to trigger invalidation');
    }
  }

  /**
   * Get invalidation statistics
   */
  async getStats(): Promise<InvalidationStats> {
    try {
      const storedStats = await this.cache.hgetall<number>(this.STATS_KEY);
      
      if (storedStats) {
        this.stats = {
          totalInvalidations: storedStats.totalInvalidations || 0,
          invalidationsByType: JSON.parse(storedStats.invalidationsByType as any || '{}'),
          invalidationsBySource: JSON.parse(storedStats.invalidationsBySource as any || '{}'),
          averageInvalidationTime: storedStats.averageInvalidationTime || 0,
          failedInvalidations: storedStats.failedInvalidations || 0
        };
      }

      return { ...this.stats };
    } catch (error) {
      logger.error({ error }, 'Failed to get invalidation stats');
      return { ...this.stats };
    }
  }

  /**
   * Reset statistics
   */
  async resetStats(): Promise<void> {
    try {
      this.stats = {
        totalInvalidations: 0,
        invalidationsByType: {},
        invalidationsBySource: {},
        averageInvalidationTime: 0,
        failedInvalidations: 0
      };

      await this.cache.del(this.STATS_KEY);
      logger.info('Invalidation stats reset');
    } catch (error) {
      logger.error({ error }, 'Failed to reset invalidation stats');
    }
  }

  /**
   * Handle incoming invalidation event
   */
  private async handleInvalidationEvent(event: InvalidationEvent): Promise<void> {
    try {
      logger.debug({
        eventId: event.id,
        type: event.type,
        source: event.source,
        reason: event.reason
      }, 'Handling invalidation event');

      // Log the event for audit purposes
      const eventKey = `invalidation_log:${event.id}`;
      await this.cache.set(eventKey, event, 7 * 24 * 60 * 60); // 7 days
    } catch (error) {
      logger.error({ error, event }, 'Failed to handle invalidation event');
    }
  }

  /**
   * Publish invalidation event to all subscribers
   */
  private async publishInvalidationEvent(event: InvalidationEvent): Promise<void> {
    try {
      const publisher = this.redisClient.getPublisher();
      await publisher.publish(this.INVALIDATION_CHANNEL, JSON.stringify(event));
    } catch (error) {
      logger.error({ error, event }, 'Failed to publish invalidation event');
    }
  }

  /**
   * Update invalidation statistics
   */
  private async updateStats(
    type: string,
    source: string,
    duration: number,
    success: boolean
  ): Promise<void> {
    try {
      this.stats.totalInvalidations++;
      this.stats.invalidationsByType[type] = (this.stats.invalidationsByType[type] || 0) + 1;
      this.stats.invalidationsBySource[source] = (this.stats.invalidationsBySource[source] || 0) + 1;
      
      if (success) {
        // Update rolling average
        const totalTime = this.stats.averageInvalidationTime * (this.stats.totalInvalidations - 1) + duration;
        this.stats.averageInvalidationTime = totalTime / this.stats.totalInvalidations;
      } else {
        this.stats.failedInvalidations++;
      }

      // Persist stats
      await this.cache.hset(this.STATS_KEY, 'totalInvalidations', this.stats.totalInvalidations);
      await this.cache.hset(this.STATS_KEY, 'invalidationsByType', JSON.stringify(this.stats.invalidationsByType));
      await this.cache.hset(this.STATS_KEY, 'invalidationsBySource', JSON.stringify(this.stats.invalidationsBySource));
      await this.cache.hset(this.STATS_KEY, 'averageInvalidationTime', this.stats.averageInvalidationTime);
      await this.cache.hset(this.STATS_KEY, 'failedInvalidations', this.stats.failedInvalidations);
    } catch (error) {
      logger.error({ error }, 'Failed to update invalidation stats');
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    // Cancel all pending invalidations
    for (const [scheduleId, timeout] of this.pendingInvalidations) {
      clearTimeout(timeout);
    }
    this.pendingInvalidations.clear();

    // Unsubscribe from events
    try {
      const subscriber = this.redisClient.getSubscriber();
      await subscriber.unsubscribe(this.INVALIDATION_CHANNEL);
    } catch (error) {
      logger.error({ error }, 'Failed to unsubscribe from invalidation events');
    }

    logger.info('Cache invalidation service cleaned up');
  }
}