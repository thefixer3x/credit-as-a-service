import { Router } from 'express';
import { DisbursementController } from '../controllers/disbursement-controller.js';

const router = Router();
const controller = new DisbursementController();

// Note: Authentication middleware should be applied at the API Gateway level
// or via Express-compatible middleware. The @caas/auth package exports Fastify middleware
// which is not compatible with this Express-based service.

/**
 * @route POST /api/v1/disbursements
 * @desc Create a single disbursement
 * @access Private
 */
router.post('/', controller.createDisbursement.bind(controller));

/**
 * @route POST /api/v1/disbursements/batch
 * @desc Create a batch disbursement
 * @access Private
 */
router.post('/batch', controller.createBatchDisbursement.bind(controller));

/**
 * @route GET /api/v1/disbursements/:id
 * @desc Get disbursement status
 * @access Private
 */
router.get('/:id', controller.getDisbursementStatus.bind(controller));

/**
 * @route DELETE /api/v1/disbursements/:id
 * @desc Cancel a disbursement
 * @access Private
 */
router.delete('/:id', controller.cancelDisbursement.bind(controller));

/**
 * @route GET /api/v1/disbursements/providers/status
 * @desc Get provider status
 * @access Private
 */
router.get('/providers/status', controller.getProviderStatus.bind(controller));

/**
 * @route GET /api/v1/disbursements/analytics
 * @desc Get disbursement analytics
 * @access Private
 */
router.get('/analytics', controller.getAnalytics.bind(controller));

/**
 * @route POST /api/v1/disbursements/reconciliation/:providerId/:date
 * @desc Perform reconciliation with provider
 * @access Private
 */
router.post('/reconciliation/:providerId/:date', controller.performReconciliation.bind(controller));

/**
 * @route GET /api/v1/disbursements/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', controller.healthCheck.bind(controller));

/**
 * @route POST /api/v1/disbursements/webhooks/:providerId
 * @desc Handle provider webhooks
 * @access Public (but requires webhook signature validation)
 */
router.post('/webhooks/:providerId', controller.handleProviderWebhook.bind(controller));

export default router;
