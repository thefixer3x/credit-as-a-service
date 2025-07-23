import { z } from 'zod';

export const smeIntegrationSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string(),
  webhookSecret: z.string(),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  endpoints: z.object({
    kyc: z.string().default('/v1/kyc'),
    kyb: z.string().default('/v1/kyb'),
    payments: z.string().default('/v1/payments'),
    webhooks: z.string().default('/v1/webhooks'),
  }).default({}),
});

export const blockchainConfigSchema = z.object({
  networks: z.object({
    mainnet: z.object({
      rpcUrl: z.string().url(),
      chainId: z.number().default(1),
      gasPrice: z.string().optional(),
    }).optional(),
    goerli: z.object({
      rpcUrl: z.string().url(),
      chainId: z.number().default(5),
      gasPrice: z.string().optional(),
    }).optional(),
    polygon: z.object({
      rpcUrl: z.string().url(),
      chainId: z.number().default(137),
      gasPrice: z.string().optional(),
    }).optional(),
    base: z.object({
      rpcUrl: z.string().url(),
      chainId: z.number().default(8453),
      gasPrice: z.string().optional(),
    }).optional(),
  }),
  contracts: z.object({
    creditAggregator: z.string().optional(),
    collateralManager: z.string().optional(),
    creditScoringOracle: z.string().optional(),
  }).default({}),
});

export const paymentProvidersSchema = z.object({
  paystack: z.object({
    secretKey: z.string().optional(),
    publicKey: z.string().optional(),
    webhookSecret: z.string().optional(),
  }).optional(),
  stripe: z.object({
    secretKey: z.string().optional(),
    publishableKey: z.string().optional(),
    webhookSecret: z.string().optional(),
  }).optional(),
  flutterwave: z.object({
    secretKey: z.string().optional(),
    publicKey: z.string().optional(),
    webhookSecret: z.string().optional(),
  }).optional(),
});

export const openBankingSchema = z.object({
  mono: z.object({
    secretKey: z.string().optional(),
    webhookSecret: z.string().optional(),
  }).optional(),
  okra: z.object({
    token: z.string().optional(),
    webhookSecret: z.string().optional(),
  }).optional(),
  plaid: z.object({
    clientId: z.string().optional(),
    secret: z.string().optional(),
    environment: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
  }).optional(),
});

export type SMEIntegration = z.infer<typeof smeIntegrationSchema>;
export type BlockchainConfig = z.infer<typeof blockchainConfigSchema>;
export type PaymentProviders = z.infer<typeof paymentProvidersSchema>;
export type OpenBanking = z.infer<typeof openBankingSchema>;