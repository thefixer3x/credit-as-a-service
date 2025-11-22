import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, asc, gte, lte, between } from 'drizzle-orm';
import { db, payments, loans, loanApplications, users } from '../db/connection';
import { logger } from '../utils/logger';

// Validation schemas
const createPaymentSchema = z.object({
  loanId: z.string().uuid(),
  amount: z.number().min(0.01).max(100000),
  paymentMethod: z.enum(['credit_card', 'bank_transfer', 'debit_card', 'check', 'cash', 'crypto']),
  paymentReference: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const processPaymentSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'cancelled', 'refunded']),
  transactionId: z.string().optional(),
  processorResponse: z.string().optional(),
  failureReason: z.string().optional(),
});

const getPaymentsQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  userId: z.string().uuid().optional(),
  loanId: z.string().uuid().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled', 'refunded']).optional(),
  paymentMethod: z.enum(['credit_card', 'bank_transfer', 'debit_card', 'check', 'cash', 'crypto']).optional(),
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  minAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  maxAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  sortBy: z.enum(['createdAt', 'updatedAt', 'amount', 'dueDate']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const refundPaymentSchema = z.object({
  amount: z.number().min(0.01).optional(), // Partial refund if specified
  reason: z.string().max(500),
});

export const paymentRoutes: FastifyPluginAsync = async function (fastify) {
  // Middleware to verify admin access
  const requireAdminAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    
    if (!user || !['admin', 'moderator'].includes(user.role || '')) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin or moderator access required'
      });
    }
  };

  // Middleware to verify user can access payment
  const requirePaymentAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    const paymentId = request.params.paymentId;
    
    // Admin can access any payment
    if (user.role === 'admin') {
      return;
    }
    
    // Regular users can only access their own payments
    try {
      const [payment] = await db.select({ 
        userId: payments.userId 
      }).from(payments).where(eq(payments.id, paymentId));
      
      if (!payment || payment.userId !== user.userId) {
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

  // Create payment
  fastify.post<{
    Body: z.infer<typeof createPaymentSchema>;
  }>('/', {
    schema: {
      description: 'Create a new payment',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['loanId', 'amount', 'paymentMethod'],
        properties: {
          loanId: { type: 'string', format: 'uuid' },
          amount: { type: 'number', minimum: 0.01, maximum: 100000 },
          paymentMethod: { 
            type: 'string', 
            enum: ['credit_card', 'bank_transfer', 'debit_card', 'check', 'cash', 'crypto'] 
          },
          paymentReference: { type: 'string' },
          notes: { type: 'string', maxLength: 500 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            payment: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                loanId: { type: 'string' },
                amount: { type: 'number' },
                paymentMethod: { type: 'string' },
                status: { type: 'string' },
                dueDate: { type: 'string' },
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
    const paymentData = createPaymentSchema.parse(request.body);
    const user = (request as any).user;

    try {
      // Verify loan exists and user has access
      const [loan] = await db.select({
        id: loanApplications.id,
        userId: loanApplications.userId,
        status: loanApplications.status,
        approvedAmount: loanApplications.approvedAmount,
        approvedRate: loanApplications.approvedRate,
        approvedTermMonths: loanApplications.approvedTermMonths,
      }).from(loanApplications).where(eq(loanApplications.id, paymentData.loanId));

      if (!loan) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Loan not found'
        });
      }

      // Check if user owns the loan (unless admin)
      if (user.role !== 'admin' && loan.userId !== user.userId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Access denied to this loan'
        });
      }

      // Check if loan is in a state that accepts payments
      if (!['funded', 'active'].includes(loan.status || '')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Loan is not in a state that accepts payments'
        });
      }

      // Calculate due date (next month)
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);

      // Calculate payment type and schedule
      const monthlyPaymentAmount = calculateMonthlyPayment(
        parseFloat(loan.approvedAmount || '0'),
        parseFloat(loan.approvedRate || '0'),
        loan.approvedTermMonths || 12
      );

      const paymentType = paymentData.amount >= monthlyPaymentAmount * 0.9 ? 'regular' : 'partial';

      // Create payment record
      const [newPayment] = await db.insert(payments).values({
        userId: loan.userId,
        loanId: paymentData.loanId,
        amount: paymentData.amount.toString(),
        principalAmount: (paymentData.amount * 0.8).toString(), // Estimate, should be calculated properly
        interestAmount: (paymentData.amount * 0.2).toString(), // Estimate, should be calculated properly
        paymentMethod: paymentData.paymentMethod,
        paymentReference: paymentData.paymentReference,
        status: 'pending',
        paymentType,
        scheduledDate: new Date(),
        dueDate,
      }).returning({
        id: payments.id,
        loanId: payments.loanId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        status: payments.status,
        paymentType: payments.paymentType,
        dueDate: payments.dueDate,
        createdAt: payments.createdAt,
      });

      logger.info('Payment created', {
        paymentId: newPayment.id,
        loanId: paymentData.loanId,
        userId: loan.userId,
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        paymentType,
        requestId: request.id,
      });

      return reply.status(201).send({
        message: 'Payment created successfully',
        payment: newPayment
      });

    } catch (error) {
      logger.error('Payment creation failed', {
        error: error instanceof Error ? error.message : String(error),
        loanId: paymentData.loanId,
        amount: paymentData.amount,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create payment'
      });
    }
  });

  // Get payments
  fastify.get<{
    Querystring: z.infer<typeof getPaymentsQuerySchema>;
  }>('/', {
    schema: {
      description: 'Get paginated list of payments',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          limit: { type: 'string' },
          userId: { type: 'string' },
          loanId: { type: 'string' },
          status: { 
            type: 'string', 
            enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'] 
          },
          paymentMethod: { 
            type: 'string', 
            enum: ['credit_card', 'bank_transfer', 'debit_card', 'check', 'cash', 'crypto'] 
          },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          minAmount: { type: 'string' },
          maxAmount: { type: 'string' },
          sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'amount', 'dueDate'] },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            payments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  loanId: { type: 'string' },
                  amount: { type: 'number' },
                  paymentMethod: { type: 'string' },
                  status: { type: 'string' },
                  paymentType: { type: 'string' },
                  dueDate: { type: 'string' },
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
    const { 
      page, limit, userId, loanId, status, paymentMethod, 
      startDate, endDate, minAmount, maxAmount, sortBy, sortOrder 
    } = getPaymentsQuerySchema.parse(request.query);
    const user = (request as any).user;

    try {
      // Build query conditions
      const conditions = [];
      
      // Non-admin users can only see their own payments
      if (user.role !== 'admin') {
        conditions.push(eq(payments.userId, user.userId));
      } else if (userId) {
        conditions.push(eq(payments.userId, userId));
      }
      
      if (loanId) {
        conditions.push(eq(payments.loanId, loanId));
      }
      
      if (status) {
        conditions.push(eq(payments.status, status));
      }
      
      if (paymentMethod) {
        conditions.push(eq(payments.paymentMethod, paymentMethod));
      }
      
      if (startDate && endDate) {
        conditions.push(between(payments.createdAt, startDate, endDate));
      } else if (startDate) {
        conditions.push(gte(payments.createdAt, startDate));
      } else if (endDate) {
        conditions.push(lte(payments.createdAt, endDate));
      }
      
      if (minAmount !== undefined) {
        conditions.push(gte(payments.amount, minAmount.toString()));
      }

      if (maxAmount !== undefined) {
        conditions.push(lte(payments.amount, maxAmount.toString()));
      }

      // Get total count for pagination
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const totalQuery = db.select().from(payments)
        .leftJoin(users, eq(payments.userId, users.id));

      if (whereClause) {
        totalQuery.where(whereClause);
      }

      const totalPayments = (await totalQuery).length;
      const totalPages = Math.ceil(totalPayments / limit);

      // Get paginated results with user info
      const sortColumn = payments[sortBy as keyof typeof payments] as any;
      const sortFn = sortOrder === 'asc' ? asc : desc;
      
      const offset = (page - 1) * limit;
      
      const query = db.select({
        id: payments.id,
        userId: payments.userId,
        loanId: payments.loanId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        status: payments.status,
        paymentType: payments.paymentType,
        paymentReference: payments.paymentReference,
        transactionId: payments.transactionId,
        dueDate: payments.dueDate,
        processedAt: payments.processedAt,
        notes: payments.notes,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }
      }).from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .orderBy(sortFn(sortColumn))
        .limit(limit)
        .offset(offset);

      if (whereClause) {
        query.where(whereClause);
      }

      const paymentList = await query;

      logger.info('Payments retrieved successfully', {
        requestId: request.id,
        count: paymentList.length,
        page,
        limit,
        userId: user.role === 'admin' ? userId || 'all' : user.userId,
        status,
        loanId
      });

      return reply.send({
        payments: paymentList,
        pagination: {
          page,
          limit,
          total: totalPayments,
          totalPages
        }
      });

    } catch (error) {
      logger.error('Failed to retrieve payments', {
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve payments'
      });
    }
  });

  // Get payment by ID
  fastify.get<{
    Params: { paymentId: string };
  }>('/:paymentId', {
    schema: {
      description: 'Get payment by ID',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['paymentId'],
        properties: {
          paymentId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            payment: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                loanId: { type: 'string' },
                amount: { type: 'number' },
                paymentMethod: { type: 'string' },
                status: { type: 'string' },
                paymentType: { type: 'string' },
                paymentReference: { type: 'string' },
                transactionId: { type: 'string' },
                expectedAmount: { type: 'number' },
                dueDate: { type: 'string' },
                processedAt: { type: 'string' },
                notes: { type: 'string' },
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
    preHandler: requirePaymentAccess
  }, async (request, reply) => {
    const { paymentId } = request.params;

    try {
      const [payment] = await db.select({
        id: payments.id,
        userId: payments.userId,
        loanId: payments.loanId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        status: payments.status,
        paymentType: payments.paymentType,
        paymentReference: payments.paymentReference,
        transactionId: payments.transactionId,
        expectedAmount: payments.expectedAmount,
        dueDate: payments.dueDate,
        processedAt: payments.processedAt,
        processorResponse: payments.processorResponse,
        failureReason: payments.failureReason,
        notes: payments.notes,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }
      }).from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(eq(payments.id, paymentId));

      if (!payment) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Payment not found'
        });
      }

      return reply.send({ payment });

    } catch (error) {
      logger.error('Failed to get payment', {
        error: error instanceof Error ? error.message : String(error),
        paymentId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get payment'
      });
    }
  });

  // Process payment (admin only)
  fastify.patch<{
    Params: { paymentId: string };
    Body: z.infer<typeof processPaymentSchema>;
  }>('/:paymentId/process', {
    schema: {
      description: 'Process payment status (admin only)',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['paymentId'],
        properties: {
          paymentId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { 
            type: 'string', 
            enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'] 
          },
          transactionId: { type: 'string' },
          processorResponse: { type: 'string' },
          failureReason: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            payment: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                transactionId: { type: 'string' },
                processedAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { paymentId } = request.params;
    const updateData = processPaymentSchema.parse(request.body);
    const admin = (request as any).user;

    try {
      // Check if payment exists
      const [existingPayment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      
      if (!existingPayment) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Payment not found'
        });
      }

      // Update payment
      const updateFields: any = {
        status: updateData.status,
        updatedAt: new Date(),
      };

      if (updateData.transactionId) {
        updateFields.transactionId = updateData.transactionId;
      }

      if (updateData.processorResponse) {
        updateFields.processorResponse = updateData.processorResponse;
      }

      if (updateData.failureReason) {
        updateFields.failureReason = updateData.failureReason;
      }

      if (updateData.status === 'completed') {
        updateFields.processedAt = new Date();
      }

      const [updatedPayment] = await db.update(payments)
        .set(updateFields)
        .where(eq(payments.id, paymentId))
        .returning({
          id: payments.id,
          status: payments.status,
          transactionId: payments.transactionId,
          processedAt: payments.processedAt,
        });

      logger.info('Payment processed', {
        paymentId,
        newStatus: updateData.status,
        transactionId: updateData.transactionId,
        processedBy: admin.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'Payment processed successfully',
        payment: updatedPayment
      });

    } catch (error) {
      logger.error('Payment processing failed', {
        error: error instanceof Error ? error.message : String(error),
        paymentId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Payment processing failed'
      });
    }
  });

  // Refund payment (admin only)
  fastify.post<{
    Params: { paymentId: string };
    Body: z.infer<typeof refundPaymentSchema>;
  }>('/:paymentId/refund', {
    schema: {
      description: 'Refund payment (admin only)',
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['paymentId'],
        properties: {
          paymentId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          amount: { type: 'number', minimum: 0.01 },
          reason: { type: 'string', maxLength: 500 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            refund: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                originalPaymentId: { type: 'string' },
                amount: { type: 'number' },
                reason: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { paymentId } = request.params;
    const { amount, reason } = refundPaymentSchema.parse(request.body);
    const admin = (request as any).user;

    try {
      // Get original payment
      const [originalPayment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      
      if (!originalPayment) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Payment not found'
        });
      }

      if (originalPayment.status !== 'completed') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Can only refund completed payments'
        });
      }

      const refundAmount = amount || originalPayment.amount;

      if (refundAmount > originalPayment.amount) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Refund amount cannot exceed original payment amount'
        });
      }

      // Create refund record (negative payment)
      const [refund] = await db.insert(payments).values({
        userId: originalPayment.userId,
        loanId: originalPayment.loanId,
        amount: -refundAmount, // Negative amount for refund
        paymentMethod: originalPayment.paymentMethod,
        status: 'refunded',
        paymentType: 'refund',
        paymentReference: `REFUND-${originalPayment.id}`,
        notes: `Refund: ${reason}`,
        processedAt: new Date(),
        originalPaymentId: paymentId,
      }).returning({
        id: payments.id,
        amount: payments.amount,
        status: payments.status,
        paymentReference: payments.paymentReference,
      });

      // Update original payment status if full refund
      if (refundAmount === originalPayment.amount) {
        await db.update(payments)
          .set({ 
            status: 'refunded',
            updatedAt: new Date(),
          })
          .where(eq(payments.id, paymentId));
      }

      logger.info('Payment refunded', {
        originalPaymentId: paymentId,
        refundId: refund.id,
        refundAmount,
        reason,
        refundedBy: admin.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'Payment refunded successfully',
        refund: {
          id: refund.id,
          originalPaymentId: paymentId,
          amount: Math.abs(parseFloat(refund.amount)),
          reason,
          status: refund.status
        }
      });

    } catch (error) {
      logger.error('Payment refund failed', {
        error: error instanceof Error ? error.message : String(error),
        paymentId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Payment refund failed'
      });
    }
  });
};

// Helper function to calculate monthly payment
function calculateMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) {
    return principal / termMonths;
  }
  
  const monthlyRate = annualRate / 100 / 12;
  const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
  const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
  
  return numerator / denominator;
}