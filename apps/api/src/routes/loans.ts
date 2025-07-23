import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, gte, lte, like } from 'drizzle-orm';
import { db, loans, users, loanApplications } from '../db/connection';
import { logger } from '../utils/logger';

// Validation schemas
const createLoanApplicationSchema = z.object({
  amount: z.number().min(1000).max(1000000), // $1K to $1M
  purpose: z.enum(['personal', 'business', 'education', 'home', 'auto', 'debt_consolidation', 'other']),
  termMonths: z.number().min(6).max(360), // 6 months to 30 years
  annualIncome: z.number().min(0),
  employmentStatus: z.enum(['employed', 'self_employed', 'unemployed', 'retired', 'student']),
  monthlyDebtPayments: z.number().min(0).optional().default(0),
  collateralValue: z.number().min(0).optional(),
  collateralType: z.enum(['real_estate', 'vehicle', 'savings', 'securities', 'other', 'none']).optional().default('none'),
  description: z.string().max(1000).optional(),
});

const updateLoanStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'funded', 'active', 'completed', 'defaulted']),
  adminNotes: z.string().max(1000).optional(),
  approvedAmount: z.number().min(0).optional(),
  approvedRate: z.number().min(0).max(50).optional(), // 0-50% APR
  approvedTermMonths: z.number().min(6).max(360).optional(),
});

const getLoansQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  userId: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'funded', 'active', 'completed', 'defaulted']).optional(),
  purpose: z.enum(['personal', 'business', 'education', 'home', 'auto', 'debt_consolidation', 'other']).optional(),
  minAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  maxAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  sortBy: z.enum(['createdAt', 'updatedAt', 'amount', 'approvedRate']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const loanRoutes: FastifyPluginAsync = async function (fastify) {
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

  // Middleware to verify user can access loan
  const requireLoanAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    const loanId = request.params.loanId;
    
    // Admin can access any loan
    if (user.role === 'admin') {
      return;
    }
    
    // Regular users can only access their own loans
    try {
      const [loan] = await db.select({ userId: loans.userId }).from(loans).where(eq(loans.id, loanId));
      
      if (!loan || loan.userId !== user.userId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }
    } catch (error) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to verify access'
      });
    }
  };

  // Create loan application
  fastify.post<{
    Body: z.infer<typeof createLoanApplicationSchema>;
  }>('/applications', {
    schema: {
      description: 'Submit a new loan application',
      tags: ['Loans'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['amount', 'purpose', 'termMonths', 'annualIncome', 'employmentStatus'],
        properties: {
          amount: { type: 'number', minimum: 1000, maximum: 1000000 },
          purpose: { 
            type: 'string', 
            enum: ['personal', 'business', 'education', 'home', 'auto', 'debt_consolidation', 'other'] 
          },
          termMonths: { type: 'number', minimum: 6, maximum: 360 },
          annualIncome: { type: 'number', minimum: 0 },
          employmentStatus: { 
            type: 'string', 
            enum: ['employed', 'self_employed', 'unemployed', 'retired', 'student'] 
          },
          monthlyDebtPayments: { type: 'number', minimum: 0 },
          collateralValue: { type: 'number', minimum: 0 },
          collateralType: { 
            type: 'string', 
            enum: ['real_estate', 'vehicle', 'savings', 'securities', 'other', 'none'] 
          },
          description: { type: 'string', maxLength: 1000 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            application: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                amount: { type: 'number' },
                purpose: { type: 'string' },
                termMonths: { type: 'number' },
                status: { type: 'string' },
                creditScore: { type: 'number' },
                estimatedRate: { type: 'number' },
                createdAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request, reply) => {
    const applicationData = createLoanApplicationSchema.parse(request.body);
    const user = (request as any).user;

    try {
      // Get user's current credit score
      const [userRecord] = await db.select({
        creditScore: users.creditScore,
      }).from(users).where(eq(users.id, user.userId));

      if (!userRecord) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      // Calculate debt-to-income ratio
      const monthlyIncome = applicationData.annualIncome / 12;
      const debtToIncomeRatio = applicationData.monthlyDebtPayments / monthlyIncome;

      // Simple credit scoring and rate estimation
      const creditScore = userRecord.creditScore || 650; // Default if no score
      let estimatedRate = 15.0; // Base rate
      
      // Adjust rate based on credit score
      if (creditScore >= 750) estimatedRate = 6.5;
      else if (creditScore >= 700) estimatedRate = 8.5;
      else if (creditScore >= 650) estimatedRate = 12.0;
      else if (creditScore >= 600) estimatedRate = 18.0;
      else estimatedRate = 25.0;
      
      // Adjust for debt-to-income ratio
      if (debtToIncomeRatio > 0.4) estimatedRate += 3.0;
      else if (debtToIncomeRatio > 0.3) estimatedRate += 1.5;
      
      // Adjust for collateral
      if (applicationData.collateralType !== 'none' && applicationData.collateralValue) {
        const collateralRatio = applicationData.collateralValue / applicationData.amount;
        if (collateralRatio >= 1.2) estimatedRate -= 2.0;
        else if (collateralRatio >= 1.0) estimatedRate -= 1.0;
      }

      // Ensure rate is within bounds
      estimatedRate = Math.max(3.0, Math.min(50.0, estimatedRate));

      // Create loan application record
      const [newApplication] = await db.insert(loanApplications).values({
        userId: user.userId,
        amount: applicationData.amount,
        purpose: applicationData.purpose,
        termMonths: applicationData.termMonths,
        annualIncome: applicationData.annualIncome,
        employmentStatus: applicationData.employmentStatus,
        monthlyDebtPayments: applicationData.monthlyDebtPayments,
        collateralValue: applicationData.collateralValue,
        collateralType: applicationData.collateralType,
        description: applicationData.description,
        creditScore,
        debtToIncomeRatio,
        estimatedRate,
        status: 'pending',
      }).returning({
        id: loanApplications.id,
        amount: loanApplications.amount,
        purpose: loanApplications.purpose,
        termMonths: loanApplications.termMonths,
        status: loanApplications.status,
        creditScore: loanApplications.creditScore,
        estimatedRate: loanApplications.estimatedRate,
        createdAt: loanApplications.createdAt,
      });

      logger.info('Loan application submitted', {
        applicationId: newApplication.id,
        userId: user.userId,
        amount: applicationData.amount,
        purpose: applicationData.purpose,
        creditScore,
        estimatedRate,
        requestId: request.id,
      });

      return reply.status(201).send({
        message: 'Loan application submitted successfully',
        application: newApplication
      });

    } catch (error) {
      logger.error('Loan application submission failed', {
        error: error.message,
        userId: user.userId,
        amount: applicationData.amount,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to submit loan application'
      });
    }
  });

  // Get loan applications/loans
  fastify.get<{
    Querystring: z.infer<typeof getLoansQuerySchema>;
  }>('/', {
    schema: {
      description: 'Get paginated list of loans',
      tags: ['Loans'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          limit: { type: 'string' },
          userId: { type: 'string' },
          status: { 
            type: 'string', 
            enum: ['pending', 'approved', 'rejected', 'funded', 'active', 'completed', 'defaulted'] 
          },
          purpose: { 
            type: 'string', 
            enum: ['personal', 'business', 'education', 'home', 'auto', 'debt_consolidation', 'other'] 
          },
          minAmount: { type: 'string' },
          maxAmount: { type: 'string' },
          sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'amount', 'approvedRate'] },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            loans: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  amount: { type: 'number' },
                  purpose: { type: 'string' },
                  termMonths: { type: 'number' },
                  status: { type: 'string' },
                  approvedAmount: { type: 'number' },
                  approvedRate: { type: 'number' },
                  creditScore: { type: 'number' },
                  user: {
                    type: 'object',
                    properties: {
                      firstName: { type: 'string' },
                      lastName: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' }
              }
            }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request, reply) => {
    const { page, limit, userId, status, purpose, minAmount, maxAmount, sortBy, sortOrder } = getLoansQuerySchema.parse(request.query);
    const user = (request as any).user;

    try {
      // Build query conditions
      const conditions = [];
      
      // Non-admin users can only see their own loans
      if (user.role !== 'admin') {
        conditions.push(eq(loanApplications.userId, user.userId));
      } else if (userId) {
        conditions.push(eq(loanApplications.userId, userId));
      }
      
      if (status) {
        conditions.push(eq(loanApplications.status, status));
      }
      
      if (purpose) {
        conditions.push(eq(loanApplications.purpose, purpose));
      }
      
      if (minAmount !== undefined) {
        conditions.push(gte(loanApplications.amount, minAmount));
      }
      
      if (maxAmount !== undefined) {
        conditions.push(lte(loanApplications.amount, maxAmount));
      }

      // Get total count for pagination
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      const totalQuery = db.select().from(loanApplications)
        .leftJoin(users, eq(loanApplications.userId, users.id));
      
      if (whereClause) {
        totalQuery.where(whereClause);
      }
      
      const totalLoans = (await totalQuery).length;
      const totalPages = Math.ceil(totalLoans / limit);

      // Get paginated results with user info
      const sortColumn = loanApplications[sortBy as keyof typeof loanApplications];
      const sortFn = sortOrder === 'asc' ? asc : desc;
      
      const offset = (page - 1) * limit;
      
      const query = db.select({
        id: loanApplications.id,
        userId: loanApplications.userId,
        amount: loanApplications.amount,
        purpose: loanApplications.purpose,
        termMonths: loanApplications.termMonths,
        status: loanApplications.status,
        approvedAmount: loanApplications.approvedAmount,
        approvedRate: loanApplications.approvedRate,
        creditScore: loanApplications.creditScore,
        estimatedRate: loanApplications.estimatedRate,
        annualIncome: loanApplications.annualIncome,
        employmentStatus: loanApplications.employmentStatus,
        collateralValue: loanApplications.collateralValue,
        collateralType: loanApplications.collateralType,
        adminNotes: loanApplications.adminNotes,
        createdAt: loanApplications.createdAt,
        updatedAt: loanApplications.updatedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }
      }).from(loanApplications)
        .leftJoin(users, eq(loanApplications.userId, users.id))
        .orderBy(sortFn(sortColumn))
        .limit(limit)
        .offset(offset);

      if (whereClause) {
        query.where(whereClause);
      }

      const loanList = await query;

      logger.info('Loans retrieved successfully', {
        requestId: request.id,
        count: loanList.length,
        page,
        limit,
        userId: user.role === 'admin' ? userId || 'all' : user.userId,
        status,
        purpose
      });

      return reply.send({
        loans: loanList,
        pagination: {
          page,
          limit,
          total: totalLoans,
          totalPages
        }
      });

    } catch (error) {
      logger.error('Failed to retrieve loans', {
        error: error.message,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve loans'
      });
    }
  });

  // Get loan by ID
  fastify.get<{
    Params: { loanId: string };
  }>('/:loanId', {
    schema: {
      description: 'Get loan by ID',
      tags: ['Loans'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['loanId'],
        properties: {
          loanId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            loan: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                amount: { type: 'number' },
                purpose: { type: 'string' },
                termMonths: { type: 'number' },
                status: { type: 'string' },
                approvedAmount: { type: 'number' },
                approvedRate: { type: 'number' },
                creditScore: { type: 'number' },
                estimatedRate: { type: 'number' },
                annualIncome: { type: 'number' },
                employmentStatus: { type: 'string' },
                collateralValue: { type: 'number' },
                collateralType: { type: 'string' },
                adminNotes: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string' }
                  }
                },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: requireLoanAccess
  }, async (request, reply) => {
    const { loanId } = request.params;

    try {
      const [loan] = await db.select({
        id: loanApplications.id,
        userId: loanApplications.userId,
        amount: loanApplications.amount,
        purpose: loanApplications.purpose,
        termMonths: loanApplications.termMonths,
        status: loanApplications.status,
        approvedAmount: loanApplications.approvedAmount,
        approvedRate: loanApplications.approvedRate,
        creditScore: loanApplications.creditScore,
        estimatedRate: loanApplications.estimatedRate,
        annualIncome: loanApplications.annualIncome,
        employmentStatus: loanApplications.employmentStatus,
        collateralValue: loanApplications.collateralValue,
        collateralType: loanApplications.collateralType,
        adminNotes: loanApplications.adminNotes,
        description: loanApplications.description,
        debtToIncomeRatio: loanApplications.debtToIncomeRatio,
        monthlyDebtPayments: loanApplications.monthlyDebtPayments,
        createdAt: loanApplications.createdAt,
        updatedAt: loanApplications.updatedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }
      }).from(loanApplications)
        .leftJoin(users, eq(loanApplications.userId, users.id))
        .where(eq(loanApplications.id, loanId));

      if (!loan) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Loan not found'
        });
      }

      return reply.send({ loan });

    } catch (error) {
      logger.error('Failed to get loan', {
        error: error.message,
        loanId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get loan'
      });
    }
  });

  // Update loan status (admin only)
  fastify.patch<{
    Params: { loanId: string };
    Body: z.infer<typeof updateLoanStatusSchema>;
  }>('/:loanId/status', {
    schema: {
      description: 'Update loan status (admin only)',
      tags: ['Loans'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['loanId'],
        properties: {
          loanId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { 
            type: 'string', 
            enum: ['pending', 'approved', 'rejected', 'funded', 'active', 'completed', 'defaulted'] 
          },
          adminNotes: { type: 'string', maxLength: 1000 },
          approvedAmount: { type: 'number', minimum: 0 },
          approvedRate: { type: 'number', minimum: 0, maximum: 50 },
          approvedTermMonths: { type: 'number', minimum: 6, maximum: 360 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            loan: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                approvedAmount: { type: 'number' },
                approvedRate: { type: 'number' },
                approvedTermMonths: { type: 'number' },
                adminNotes: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { loanId } = request.params;
    const updateData = updateLoanStatusSchema.parse(request.body);
    const admin = (request as any).user;

    try {
      // Check if loan exists
      const [existingLoan] = await db.select().from(loanApplications).where(eq(loanApplications.id, loanId));
      
      if (!existingLoan) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Loan not found'
        });
      }

      // Update loan
      const [updatedLoan] = await db.update(loanApplications)
        .set({
          status: updateData.status,
          adminNotes: updateData.adminNotes,
          approvedAmount: updateData.approvedAmount,
          approvedRate: updateData.approvedRate,
          approvedTermMonths: updateData.approvedTermMonths,
          updatedAt: new Date(),
        })
        .where(eq(loanApplications.id, loanId))
        .returning({
          id: loanApplications.id,
          status: loanApplications.status,
          approvedAmount: loanApplications.approvedAmount,
          approvedRate: loanApplications.approvedRate,
          approvedTermMonths: loanApplications.approvedTermMonths,
          adminNotes: loanApplications.adminNotes,
        });

      logger.info('Loan status updated', {
        loanId,
        newStatus: updateData.status,
        updatedBy: admin.userId,
        approvedAmount: updateData.approvedAmount,
        approvedRate: updateData.approvedRate,
        requestId: request.id,
      });

      return reply.send({
        message: 'Loan status updated successfully',
        loan: updatedLoan
      });

    } catch (error) {
      logger.error('Loan status update failed', {
        error: error.message,
        loanId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Loan status update failed'
      });
    }
  });

  // Delete loan application (admin only)
  fastify.delete<{
    Params: { loanId: string };
  }>('/:loanId', {
    schema: {
      description: 'Delete loan application (admin only)',
      tags: ['Loans'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['loanId'],
        properties: {
          loanId: { type: 'string' }
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
    const { loanId } = request.params;
    const admin = (request as any).user;

    try {
      // Check if loan exists
      const [loan] = await db.select().from(loanApplications).where(eq(loanApplications.id, loanId));
      
      if (!loan) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Loan not found'
        });
      }

      // Prevent deletion of active loans
      if (['funded', 'active'].includes(loan.status)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot delete active loans'
        });
      }

      // Delete loan
      await db.delete(loanApplications).where(eq(loanApplications.id, loanId));

      logger.info('Loan application deleted', {
        loanId,
        deletedLoanAmount: loan.amount,
        deletedLoanStatus: loan.status,
        deletedBy: admin.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'Loan application deleted successfully'
      });

    } catch (error) {
      logger.error('Loan deletion failed', {
        error: error.message,
        loanId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Loan deletion failed'
      });
    }
  });
};