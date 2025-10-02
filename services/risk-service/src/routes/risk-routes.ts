import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { RiskController } from '../controllers/risk-controller.js';

const CreditApplicationBodySchema = z.object({
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

const RiskAssessmentResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
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
    createdAt: z.string(),
    expiresAt: z.string(),
  }),
});

export function createRiskRoutes(controller: RiskController) {
  return async function riskRoutes(fastify: FastifyInstance) {
    // Assess credit risk
    fastify.post('/assess', {
      schema: {
        description: 'Assess credit risk for a loan application',
        tags: ['Risk Assessment'],
        body: CreditApplicationBodySchema,
        response: {
          200: RiskAssessmentResponseSchema,
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              details: { type: 'array' },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
      handler: controller.assessCreditRisk.bind(controller),
    });

    // Get risk assessment by ID
    fastify.get('/assessment/:assessmentId', {
      schema: {
        description: 'Get risk assessment by ID',
        tags: ['Risk Assessment'],
        params: {
          type: 'object',
          properties: {
            assessmentId: { type: 'string', format: 'uuid' },
          },
          required: ['assessmentId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
      handler: controller.getRiskAssessment.bind(controller),
    });

    // Get risk factors for user
    fastify.get('/factors/:userId', {
      schema: {
        description: 'Get risk factors for a user',
        tags: ['Risk Assessment'],
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
          required: ['userId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  riskFactors: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      handler: controller.getRiskFactors.bind(controller),
    });

    // Update risk model (admin only)
    fastify.post('/model/update', {
      schema: {
        description: 'Update risk assessment model',
        tags: ['Risk Model'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
      handler: controller.updateRiskModel.bind(controller),
    });
  };
}
