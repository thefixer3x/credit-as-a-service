import { FastifyPluginAsync } from 'fastify';
import { ComplianceController } from '../controllers/compliance-controller.js';

export function createComplianceRoutes(controller: ComplianceController): FastifyPluginAsync {
  return async (app) => {
    // Submit KYC application
    app.post('/kyc', {
      schema: {
        description: 'Submit a KYC application for compliance verification',
        tags: ['Compliance'],
        body: {
          type: 'object',
          required: ['userId', 'personalInfo', 'documents'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            personalInfo: {
              type: 'object',
              required: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'address', 'phoneNumber', 'email'],
              properties: {
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                dateOfBirth: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                nationality: { type: 'string', minLength: 2, maxLength: 2 },
                address: {
                  type: 'object',
                  required: ['street', 'city', 'state', 'postalCode', 'country'],
                  properties: {
                    street: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    postalCode: { type: 'string' },
                    country: { type: 'string', minLength: 2, maxLength: 2 },
                  },
                },
                phoneNumber: { type: 'string' },
                email: { type: 'string', format: 'email' },
              },
            },
            documents: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'documentNumber', 'issuingCountry', 'fileUrl', 'uploadedAt'],
                properties: {
                  type: { type: 'string', enum: ['passport', 'drivers_license', 'national_id', 'utility_bill', 'bank_statement'] },
                  documentNumber: { type: 'string' },
                  issuingCountry: { type: 'string', minLength: 2, maxLength: 2 },
                  expiryDate: { type: 'string' },
                  fileUrl: { type: 'string', format: 'uri' },
                  uploadedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            businessInfo: {
              type: 'object',
              properties: {
                businessName: { type: 'string' },
                businessType: { type: 'string' },
                registrationNumber: { type: 'string' },
                taxId: { type: 'string' },
                businessAddress: {
                  type: 'object',
                  properties: {
                    street: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    postalCode: { type: 'string' },
                    country: { type: 'string', minLength: 2, maxLength: 2 },
                  },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    }, controller.submitKYC.bind(controller));

    // Get compliance status for a user
    app.get('/status/:userId', {
      schema: {
        description: 'Get compliance status for a user',
        tags: ['Compliance'],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
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
    }, controller.getComplianceStatus.bind(controller));

    // Perform AML check
    app.post('/aml/:userId', {
      schema: {
        description: 'Perform AML screening for a user',
        tags: ['Compliance'],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
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
    }, controller.checkAML.bind(controller));
  };
}
