import { z } from 'zod';

export const authConfigSchema = z.object({
  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('24h'),
    refreshExpiresIn: z.string().default('7d'),
    algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS256'),
  }),
  oauth: z.object({
    google: z.object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUri: z.string().url().optional(),
    }).optional(),
    microsoft: z.object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUri: z.string().url().optional(),
    }).optional(),
  }).default({}),
  session: z.object({
    name: z.string().default('caas_session'),
    secret: z.string().min(32),
    maxAge: z.number().default(24 * 60 * 60 * 1000), // 24 hours
    secure: z.boolean().default(true),
    httpOnly: z.boolean().default(true),
    sameSite: z.enum(['strict', 'lax', 'none']).default('lax'),
  }),
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(100), // requests per window
    skipSuccessfulRequests: z.boolean().default(false),
  }).default({}),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;