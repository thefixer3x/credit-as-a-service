import { z } from 'zod';
import {
  disbursementRequestSchema,
  disbursementResultSchema,
  batchDisbursementSchema,
  disbursementStatusSchema,
} from '../payment.js';

/**
 * Disbursement Service Contract
 * Defines the API contract for the disbursement service
 */

// Process disbursement request/response
export const processDisbursementRequest = disbursementRequestSchema;
export const processDisbursementResponse = disbursementResultSchema;

// Get disbursement status request/response
export const getDisbursementStatusRequest = z.object({
  requestId: z.string().uuid(),
});
export const getDisbursementStatusResponse = disbursementResultSchema.nullable();

// Cancel disbursement request/response
export const cancelDisbursementRequest = z.object({
  requestId: z.string().uuid(),
});
export const cancelDisbursementResponse = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// Process batch disbursement request/response
export const processBatchDisbursementRequest = batchDisbursementSchema.omit({
  status: true,
  summary: true,
  processedAt: true,
  completedAt: true,
});
export const processBatchDisbursementResponse = batchDisbursementSchema;

/**
 * Service Contract Definition
 */
export const disbursementServiceContract = {
  processDisbursement: {
    request: processDisbursementRequest,
    response: processDisbursementResponse,
  },
  getDisbursementStatus: {
    request: getDisbursementStatusRequest,
    response: getDisbursementStatusResponse,
  },
  cancelDisbursement: {
    request: cancelDisbursementRequest,
    response: cancelDisbursementResponse,
  },
  processBatchDisbursement: {
    request: processBatchDisbursementRequest,
    response: processBatchDisbursementResponse,
  },
} as const;

export type DisbursementServiceContract = typeof disbursementServiceContract;

// Type helpers for service implementations
export type ProcessDisbursementRequest = z.infer<typeof processDisbursementRequest>;
export type ProcessDisbursementResponse = z.infer<typeof processDisbursementResponse>;
export type GetDisbursementStatusRequest = z.infer<typeof getDisbursementStatusRequest>;
export type GetDisbursementStatusResponse = z.infer<typeof getDisbursementStatusResponse>;
export type CancelDisbursementRequest = z.infer<typeof cancelDisbursementRequest>;
export type CancelDisbursementResponse = z.infer<typeof cancelDisbursementResponse>;
export type ProcessBatchDisbursementRequest = z.infer<typeof processBatchDisbursementRequest>;
export type ProcessBatchDisbursementResponse = z.infer<typeof processBatchDisbursementResponse>;
