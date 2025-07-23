import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, count, sql } from 'drizzle-orm';
import { db, users, loanApplications, payments, creditReports, apiKeys } from '../db/connection';
import { generateApiKey } from '../utils/crypto';
import { logger } from '../utils/logger';

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).optional().default(['read']),
  expiresAt: z.string().optional().transform(val => val ? new Date(val) : undefined),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().optional().transform(val => val ? new Date(val) : undefined),
});

export const adminRoutes: FastifyPluginAsync = async function (fastify) {
  // Middleware to verify admin access
  const requireAdminAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    
    if (!user || user.role !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }
  };

  // Admin dashboard metrics
  fastify.get('/dashboard', {
    schema: {
      description: 'Get admin dashboard metrics',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              properties: {
                totalUsers: { type: 'number' },
                activeUsers: { type: 'number' },
                totalLoans: { type: 'number' },
                pendingLoans: { type: 'number' },
                approvedLoans: { type: 'number' },
                totalPayments: { type: 'number' },
                completedPayments: { type: 'number' },
                totalLoanValue: { type: 'number' },
                averageCreditScore: { type: 'number' }
              }
            },
            recentActivity: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  description: { type: 'string' },
                  timestamp: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    try {
      // Get dashboard metrics
      const [userStats] = await db.select({
        totalUsers: count(),
        activeUsers: sql<number>`COUNT(CASE WHEN is_active = true THEN 1 END)`,
        averageCreditScore: sql<number>`AVG(credit_score)`,
      }).from(users);

      const [loanStats] = await db.select({
        totalLoans: count(),
        pendingLoans: sql<number>`COUNT(CASE WHEN status = 'pending' THEN 1 END)`,
        approvedLoans: sql<number>`COUNT(CASE WHEN status = 'approved' THEN 1 END)`,
        totalLoanValue: sql<number>`SUM(amount)`,
      }).from(loanApplications);

      const [paymentStats] = await db.select({
        totalPayments: count(),
        completedPayments: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
      }).from(payments);

      // Get recent activity (last 10 items)
      const recentLoans = await db.select({
        id: loanApplications.id,
        amount: loanApplications.amount,
        status: loanApplications.status,
        createdAt: loanApplications.createdAt,
      }).from(loanApplications)
        .orderBy(desc(loanApplications.createdAt))
        .limit(5);

      const recentPayments = await db.select({
        id: payments.id,
        amount: payments.amount,
        status: payments.status,
        createdAt: payments.createdAt,
      }).from(payments)
        .orderBy(desc(payments.createdAt))
        .limit(5);

      // Format recent activity
      const recentActivity = [
        ...recentLoans.map(loan => ({
          type: 'loan',
          description: `Loan application for $${loan.amount.toLocaleString()} - ${loan.status}`,
          timestamp: loan.createdAt.toISOString()
        })),
        ...recentPayments.map(payment => ({
          type: 'payment',
          description: `Payment of $${payment.amount.toLocaleString()} - ${payment.status}`,
          timestamp: payment.createdAt.toISOString()
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      const metrics = {
        totalUsers: userStats.totalUsers || 0,
        activeUsers: userStats.activeUsers || 0,
        totalLoans: loanStats.totalLoans || 0,
        pendingLoans: loanStats.pendingLoans || 0,
        approvedLoans: loanStats.approvedLoans || 0,
        totalPayments: paymentStats.totalPayments || 0,
        completedPayments: paymentStats.completedPayments || 0,
        totalLoanValue: loanStats.totalLoanValue || 0,
        averageCreditScore: Math.round(userStats.averageCreditScore || 0),
      };

      logger.info('Admin dashboard metrics retrieved', {
        requestId: request.id,
        metrics
      });

      return reply.send({
        metrics,
        recentActivity
      });

    } catch (error) {
      logger.error('Failed to get admin dashboard metrics', {
        error: error.message,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get dashboard metrics'
      });
    }
  });

  // Get API keys
  fastify.get('/api-keys', {
    schema: {
      description: 'Get list of API keys',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            apiKeys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  keyPrefix: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  lastUsed: { type: 'string' },
                  expiresAt: { type: 'string' },
                  createdAt: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    try {
      const apiKeyList = await db.select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        permissions: apiKeys.permissions,
        isActive: apiKeys.isActive,
        lastUsed: apiKeys.lastUsed,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      }).from(apiKeys)
        .orderBy(desc(apiKeys.createdAt));

      return reply.send({ apiKeys: apiKeyList });

    } catch (error) {
      logger.error('Failed to get API keys', {
        error: error.message,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get API keys'
      });
    }
  });

  // Create API key
  fastify.post<{
    Body: z.infer<typeof createApiKeySchema>;
  }>('/api-keys', {
    schema: {
      description: 'Create new API key',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          permissions: { 
            type: 'array', 
            items: { type: 'string', enum: ['read', 'write', 'admin'] } 
          },
          expiresAt: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            apiKey: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                key: { type: 'string' },
                keyPrefix: { type: 'string' },
                permissions: { type: 'array', items: { type: 'string' } },
                expiresAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { name, permissions, expiresAt } = createApiKeySchema.parse(request.body);
    const admin = (request as any).user;

    try {
      // Generate API key
      const { key, keyHash, keyPrefix } = generateApiKey();

      // Create API key record
      const [newApiKey] = await db.insert(apiKeys).values({
        userId: admin.userId,
        name,
        keyHash,
        keyPrefix,
        permissions,
        expiresAt,
        isActive: true,
      }).returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        permissions: apiKeys.permissions,
        expiresAt: apiKeys.expiresAt,
      });

      logger.info('API key created', {
        apiKeyId: newApiKey.id,
        name,
        keyPrefix,
        permissions,
        createdBy: admin.userId,
        requestId: request.id,
      });

      return reply.status(201).send({
        message: 'API key created successfully',
        apiKey: {
          ...newApiKey,
          key // Only return the full key once during creation
        }
      });

    } catch (error) {
      logger.error('API key creation failed', {
        error: error.message,
        name,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'API key creation failed'
      });
    }
  });

  // Update API key
  fastify.patch<{
    Params: { keyId: string };
    Body: z.infer<typeof updateApiKeySchema>;
  }>('/api-keys/:keyId', {
    schema: {
      description: 'Update API key',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['keyId'],
        properties: {
          keyId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          isActive: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            apiKey: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                isActive: { type: 'boolean' },
                expiresAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { keyId } = request.params;
    const updateData = updateApiKeySchema.parse(request.body);
    const admin = (request as any).user;

    try {
      // Check if API key exists
      const [existingKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId));
      
      if (!existingKey) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'API key not found'
        });
      }

      // Update API key
      const [updatedKey] = await db.update(apiKeys)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(apiKeys.id, keyId))
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          isActive: apiKeys.isActive,
          expiresAt: apiKeys.expiresAt,
        });

      logger.info('API key updated', {
        keyId,
        updatedBy: admin.userId,
        changes: Object.keys(updateData),
        requestId: request.id,
      });

      return reply.send({
        message: 'API key updated successfully',
        apiKey: updatedKey
      });

    } catch (error) {
      logger.error('API key update failed', {
        error: error.message,
        keyId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'API key update failed'
      });
    }
  });

  // Delete API key
  fastify.delete<{
    Params: { keyId: string };
  }>('/api-keys/:keyId', {
    schema: {
      description: 'Delete API key',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['keyId'],
        properties: {
          keyId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { keyId } = request.params;
    const admin = (request as any).user;

    try {
      // Check if API key exists
      const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId));
      
      if (!apiKey) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'API key not found'
        });
      }

      // Delete API key
      await db.delete(apiKeys).where(eq(apiKeys.id, keyId));

      logger.info('API key deleted', {
        keyId,
        deletedKeyName: apiKey.name,
        deletedBy: admin.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'API key deleted successfully'
      });

    } catch (error) {
      logger.error('API key deletion failed', {
        error: error.message,
        keyId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'API key deletion failed'
      });
    }
  });

  // System health check
  fastify.get('/health', {
    schema: {
      description: 'Get system health status',
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                redis: { type: 'string' },
                api: { type: 'string' }
              }
            },
            uptime: { type: 'number' },
            timestamp: { type: 'string' }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    try {
      // Test database connection
      let dbStatus = 'healthy';
      try {
        await db.select().from(users).limit(1);
      } catch (error) {
        dbStatus = 'unhealthy';
      }

      return reply.send({
        status: 'operational',
        services: {
          database: dbStatus,
          redis: 'not_configured', // Placeholder
          api: 'healthy'
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Health check failed', {
        error: error.message,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Health check failed'
      });
    }
  });
};