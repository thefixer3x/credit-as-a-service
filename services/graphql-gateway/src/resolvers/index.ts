import { GraphQLScalarType, Kind } from 'graphql';
import axios from 'axios';
import pino from 'pino';

const logger = pino({ name: 'graphql-resolvers' });

// Service URLs (in production, these would come from service discovery)
const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:8001',
  risk: process.env.RISK_SERVICE_URL || 'http://localhost:3005',
  compliance: process.env.COMPLIANCE_SERVICE_URL || 'http://localhost:3006',
  creditProviders: process.env.CREDIT_PROVIDERS_SERVICE_URL || 'http://localhost:3008',
  analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3010',
};

// Date scalar resolver
const dateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString() : value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// JSON scalar resolver
const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value: any) {
    return value;
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral(ast) {
    return ast;
  },
});

// Helper function to make service calls
async function callService(serviceName: string, endpoint: string, data?: any) {
  try {
    const url = `${SERVICE_URLS[serviceName]}${endpoint}`;
    const config = {
      method: data ? 'POST' : 'GET',
      url,
      data,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const response = await axios(config);
    return response.data;
  } catch (error) {
    logger.error({ serviceName, endpoint, error }, 'Service call failed');
    throw new Error(`Service call failed: ${serviceName}`);
  }
}

export const resolvers = {
  Date: dateScalar,
  JSON: jsonScalar,

  Query: {
    // User queries
    async user(parent: any, { id }: { id: string }) {
      try {
        const response = await callService('auth', `/api/v1/users/${id}`);
        return response.data;
      } catch (error) {
        logger.error({ userId: id, error }, 'Failed to fetch user');
        return null;
      }
    },

    async users(parent: any, { limit = 10, offset = 0 }: { limit?: number; offset?: number }) {
      try {
        const response = await callService('auth', `/api/v1/users?limit=${limit}&offset=${offset}`);
        return response.data || [];
      } catch (error) {
        logger.error({ limit, offset, error }, 'Failed to fetch users');
        return [];
      }
    },

    // Risk assessment queries
    async riskAssessment(parent: any, { assessmentId }: { assessmentId: string }) {
      try {
        const response = await callService('risk', `/api/v1/risk/assessment/${assessmentId}`);
        return response.data;
      } catch (error) {
        logger.error({ assessmentId, error }, 'Failed to fetch risk assessment');
        return null;
      }
    },

    async riskFactors(parent: any, { userId }: { userId: string }) {
      try {
        const response = await callService('risk', `/api/v1/risk/factors/${userId}`);
        return response.data?.riskFactors || [];
      } catch (error) {
        logger.error({ userId, error }, 'Failed to fetch risk factors');
        return [];
      }
    },

    // Compliance queries
    async complianceResult(parent: any, { userId }: { userId: string }) {
      try {
        const response = await callService('compliance', `/api/v1/compliance/result/${userId}`);
        return response.data;
      } catch (error) {
        logger.error({ userId, error }, 'Failed to fetch compliance result');
        return null;
      }
    },

    // Provider queries
    async creditProviders(parent: any, { status }: { status?: string }) {
      try {
        const endpoint = status ? `/api/v1/providers?status=${status}` : '/api/v1/providers';
        const response = await callService('creditProviders', endpoint);
        return response.data || [];
      } catch (error) {
        logger.error({ status, error }, 'Failed to fetch credit providers');
        return [];
      }
    },

    async creditProvider(parent: any, { id }: { id: string }) {
      try {
        const response = await callService('creditProviders', `/api/v1/providers/${id}`);
        return response.data;
      } catch (error) {
        logger.error({ providerId: id, error }, 'Failed to fetch credit provider');
        return null;
      }
    },

    // Analytics queries
    async analytics(parent: any, { timeRange = '30d' }: { timeRange?: string }) {
      try {
        const response = await callService('analytics', `/api/v1/analytics?timeRange=${timeRange}`);
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ timeRange, error }, 'Failed to fetch analytics');
        return {
          success: false,
          data: null,
          error: 'Failed to fetch analytics',
        };
      }
    },

    async providerAnalytics(parent: any, { providerId, timeRange = '30d' }: { providerId: string; timeRange?: string }) {
      try {
        const response = await callService('analytics', `/api/v1/analytics/provider/${providerId}?timeRange=${timeRange}`);
        return response.data;
      } catch (error) {
        logger.error({ providerId, timeRange, error }, 'Failed to fetch provider analytics');
        return null;
      }
    },
  },

  Mutation: {
    // Risk assessment mutations
    async assessCreditRisk(parent: any, { input }: { input: any }) {
      try {
        const response = await callService('risk', '/api/v1/risk/assess', input);
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ input, error }, 'Failed to assess credit risk');
        return {
          success: false,
          data: null,
          error: 'Failed to assess credit risk',
        };
      }
    },

    // Compliance mutations
    async processKYC(parent: any, { input }: { input: any }) {
      try {
        const response = await callService('compliance', '/api/v1/compliance/kyc', input);
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ input, error }, 'Failed to process KYC');
        return {
          success: false,
          data: null,
          error: 'Failed to process KYC',
        };
      }
    },

    // Credit application mutations
    async createCreditApplication(parent: any, { input }: { input: any }) {
      try {
        const response = await callService('creditProviders', '/api/v1/applications', input);
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ input, error }, 'Failed to create credit application');
        return {
          success: false,
          data: null,
          error: 'Failed to create credit application',
        };
      }
    },

    async updateCreditApplication(parent: any, { id, status }: { id: string; status: string }) {
      try {
        const response = await callService('creditProviders', `/api/v1/applications/${id}`, { status });
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ id, status, error }, 'Failed to update credit application');
        return {
          success: false,
          data: null,
          error: 'Failed to update credit application',
        };
      }
    },

    // Provider mutations
    async createCreditProvider(parent: any, { input }: { input: any }) {
      try {
        const response = await callService('creditProviders', '/api/v1/providers', input);
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ input, error }, 'Failed to create credit provider');
        return {
          success: false,
          data: null,
          error: 'Failed to create credit provider',
        };
      }
    },

    async updateCreditProvider(parent: any, { id, input }: { id: string; input: any }) {
      try {
        const response = await callService('creditProviders', `/api/v1/providers/${id}`, input);
        return {
          success: true,
          data: response.data,
          error: null,
        };
      } catch (error) {
        logger.error({ id, input, error }, 'Failed to update credit provider');
        return {
          success: false,
          data: null,
          error: 'Failed to update credit provider',
        };
      }
    },
  },
};
