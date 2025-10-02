import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db, creditReports, users } from '../db/connection';
import { logger } from '../utils/logger';

// Validation schemas
const calculateCreditScoreSchema = z.object({
  userId: z.string().uuid().optional(), // Optional for admin use
});

const getCreditReportSchema = z.object({
  userId: z.string().uuid().optional(),
});

export const creditRoutes: FastifyPluginAsync = async function (fastify) {
  // Middleware to verify admin access
  const requireAdminAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    
    if (!user || !['admin', 'moderator'].includes(user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin or moderator access required'
      });
    }
  };

  // Get credit score
  fastify.get('/score', {
    schema: {
      description: 'Get current credit score',
      tags: ['Credit'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            creditScore: { type: 'number' },
            lastUpdated: { type: 'string' },
            scoreCategory: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request, reply) => {
    const user = (request as any).user;

    try {
      const [userRecord] = await db.select({
        creditScore: users.creditScore,
        updatedAt: users.updatedAt,
      }).from(users).where(eq(users.id, user.userId));

      if (!userRecord) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      const creditScore = userRecord.creditScore || 0;
      let scoreCategory = 'No Score';
      
      if (creditScore >= 800) scoreCategory = 'Excellent';
      else if (creditScore >= 740) scoreCategory = 'Very Good';
      else if (creditScore >= 670) scoreCategory = 'Good';
      else if (creditScore >= 580) scoreCategory = 'Fair';
      else if (creditScore > 0) scoreCategory = 'Poor';

      return reply.send({
        creditScore,
        lastUpdated: userRecord.updatedAt?.toISOString(),
        scoreCategory
      });

    } catch (error) {
      logger.error('Failed to get credit score', {
        error: error.message,
        userId: user.userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get credit score'
      });
    }
  });

  // Calculate/update credit score (admin only)
  fastify.post<{
    Body: z.infer<typeof calculateCreditScoreSchema>;
  }>('/score/calculate', {
    schema: {
      description: 'Calculate and update credit score (admin only)',
      tags: ['Credit'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            creditScore: { type: 'number' },
            previousScore: { type: 'number' }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { userId } = calculateCreditScoreSchema.parse(request.body);
    const admin = (request as any).user;
    const targetUserId = userId || admin.userId;

    try {
      // Get user's current credit score
      const [user] = await db.select({
        creditScore: users.creditScore,
      }).from(users).where(eq(users.id, targetUserId));

      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      const previousScore = user.creditScore || 0;
      
      // Simple credit score calculation (placeholder algorithm)
      // In a real system, this would analyze payment history, utilization, etc.
      let newScore = 650; // Base score
      
      // Add randomness for demo purposes
      newScore += Math.floor(Math.random() * 200) - 100; // ±100 points
      newScore = Math.max(300, Math.min(850, newScore)); // Constrain to valid range

      // Update user's credit score
      await db.update(users)
        .set({
          creditScore: newScore,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

      logger.info('Credit score calculated', {
        userId: targetUserId,
        previousScore,
        newScore,
        calculatedBy: admin.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'Credit score calculated successfully',
        creditScore: newScore,
        previousScore
      });

    } catch (error) {
      logger.error('Credit score calculation failed', {
        error: error.message,
        userId: targetUserId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Credit score calculation failed'
      });
    }
  });

  // Get credit report
  fastify.get<{
    Querystring: z.infer<typeof getCreditReportSchema>;
  }>('/report', {
    schema: {
      description: 'Get credit report',
      tags: ['Credit'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            report: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                creditScore: { type: 'number' },
                reportData: { type: 'object' },
                createdAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
      const user = (request as any).user;
      const { userId } = getCreditReportSchema.parse(request.query);
      
      // Users can only access their own reports unless they're admin
      if (user.role !== 'admin' && userId && userId !== user.userId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }
    }
  }, async (request, reply) => {
    const user = (request as any).user;
    const { userId } = getCreditReportSchema.parse(request.query);
    const targetUserId = userId || user.userId;

    try {
      // Get the most recent credit report
      const [report] = await db.select({
        id: creditReports.id,
        userId: creditReports.userId,
        creditScore: creditReports.creditScore,
        reportData: creditReports.reportData,
        createdAt: creditReports.createdAt,
      }).from(creditReports)
        .where(eq(creditReports.userId, targetUserId))
        .orderBy(desc(creditReports.createdAt))
        .limit(1);

      if (!report) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'No credit report found'
        });
      }

      return reply.send({ report });

    } catch (error) {
      logger.error('Failed to get credit report', {
        error: error.message,
        userId: targetUserId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get credit report'
      });
    }
  });

  // Placeholder for future endpoints
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      service: 'credit-engine',
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  });
};