import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import pino from 'pino';

import { RiskEngine, CreditApplicationSchema, RiskAssessmentResultSchema } from '../services/risk-engine.js';

export class RiskController {
  private riskEngine: RiskEngine;
  private logger: pino.Logger;

  constructor(riskEngine: RiskEngine, logger: pino.Logger) {
    this.riskEngine = riskEngine;
    this.logger = logger;
  }

  async assessCreditRisk(request: FastifyRequest, reply: FastifyReply) {
    try {
      const application = CreditApplicationSchema.parse(request.body);
      
      this.logger.info(
        { userId: application.userId, requestedAmount: application.requestedAmount },
        'Processing credit risk assessment request'
      );

      const result = await this.riskEngine.assessCreditRisk(application);
      
      return reply.code(200).send({
        success: true,
        data: result,
      });

    } catch (error) {
      this.logger.error({ error }, 'Credit risk assessment failed');
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async getRiskAssessment(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { assessmentId } = request.params as { assessmentId: string };
      
      this.logger.info({ assessmentId }, 'Retrieving risk assessment');

      const assessment = this.riskEngine.getAssessment(assessmentId);
      if (!assessment) {
        return reply.code(404).send({
          success: false,
          error: 'Risk assessment not found',
        });
      }

      return reply.code(200).send({
        success: true,
        data: assessment,
      });

    } catch (error) {
      this.logger.error({ error }, 'Failed to retrieve risk assessment');
      
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async getRiskFactors(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userId } = request.params as { userId: string };
      
      this.logger.info({ userId }, 'Retrieving risk factors');

      const riskFactors = this.riskEngine.getRiskFactors(userId);

      return reply.code(200).send({
        success: true,
        data: riskFactors,
      });

    } catch (error) {
      this.logger.error({ error }, 'Failed to retrieve risk factors');
      
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async updateRiskModel(request: FastifyRequest, reply: FastifyReply) {
    try {
      this.logger.info('Updating risk model');

      const config = z.object({
        minimumApprovalScore: z.number().min(0).max(1000).optional(),
        expiresInMs: z.number().positive().optional(),
        version: z.string().min(1).optional(),
      }).parse(request.body ?? {});
      const modelConfig = this.riskEngine.updateModel(config);

      return reply.code(200).send({
        success: true,
        data: modelConfig,
      });

    } catch (error) {
      this.logger.error({ error }, 'Failed to update risk model');

      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid model configuration',
          details: error.errors,
        });
      }
      
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}
