import { z } from 'zod';
import {
  creditAssessmentRequestSchema,
  creditAssessmentResultSchema,
  creditOfferSchema,
} from '../credit.js';

/**
 * Underwriting Service Contract
 * Defines the API contract for the underwriting/credit assessment service
 */

// Assess credit application request/response
export const assessCreditRequest = creditAssessmentRequestSchema;
export const assessCreditResponse = creditAssessmentResultSchema;

// Get assessment status request/response
export const getAssessmentStatusRequest = z.object({
  assessmentId: z.string().uuid(),
});
export const getAssessmentStatusResponse = creditAssessmentResultSchema.nullable();

// Generate offer request/response
export const generateOfferRequest = z.object({
  assessmentId: z.string().uuid(),
  userId: z.string().uuid(),
  applicationId: z.string().uuid(),
});
export const generateOfferResponse = creditOfferSchema;

// Get offers for user request/response
export const getOffersRequest = z.object({
  userId: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'rejected', 'expired']).optional(),
});
export const getOffersResponse = z.array(creditOfferSchema);

/**
 * Service Contract Definition
 */
export const underwritingServiceContract = {
  assessCreditApplication: {
    request: assessCreditRequest,
    response: assessCreditResponse,
  },
  getAssessmentStatus: {
    request: getAssessmentStatusRequest,
    response: getAssessmentStatusResponse,
  },
  generateOffer: {
    request: generateOfferRequest,
    response: generateOfferResponse,
  },
  getOffers: {
    request: getOffersRequest,
    response: getOffersResponse,
  },
} as const;

export type UnderwritingServiceContract = typeof underwritingServiceContract;

// Type helpers for service implementations
export type AssessCreditRequest = z.infer<typeof assessCreditRequest>;
export type AssessCreditResponse = z.infer<typeof assessCreditResponse>;
export type GetAssessmentStatusRequest = z.infer<typeof getAssessmentStatusRequest>;
export type GetAssessmentStatusResponse = z.infer<typeof getAssessmentStatusResponse>;
export type GenerateOfferRequest = z.infer<typeof generateOfferRequest>;
export type GenerateOfferResponse = z.infer<typeof generateOfferResponse>;
export type GetOffersRequest = z.infer<typeof getOffersRequest>;
export type GetOffersResponse = z.infer<typeof getOffersResponse>;
