import { FastifyRequest, FastifyReply } from 'fastify';
import pino from 'pino';
import { ComplianceEngine, KYCApplication, KYCApplicationSchema } from '../services/compliance-engine.js';

export class ComplianceController {
  constructor(
    private complianceEngine: ComplianceEngine,
    private logger: pino.Logger
  ) {}

  async submitKYC(
    request: FastifyRequest<{ Body: KYCApplication }>,
    reply: FastifyReply
  ) {
    try {
      const validatedApp = KYCApplicationSchema.parse(request.body);
      const result = await this.complianceEngine.processKYCApplication(validatedApp);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to submit KYC application');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getComplianceStatus(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) {
    try {
      const { userId } = request.params;

      // In a real implementation, this would fetch from database
      return reply.send({
        success: true,
        data: {
          userId,
          status: 'pending',
          message: 'Compliance check not found. Please submit KYC application.',
        },
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to get compliance status');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async checkAML(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) {
    try {
      const { userId } = request.params;

      // In a real implementation, this would perform AML screening
      return reply.send({
        success: true,
        data: {
          userId,
          amlStatus: 'pending',
          message: 'AML check requires KYC submission first.',
        },
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to perform AML check');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
