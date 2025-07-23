import { Router } from 'express';
import { OnboardingController } from '../controllers/onboarding-controller.js';
import { authMiddleware, validateApiKey, rateLimiter, requireRole } from '@caas/auth';

const router = Router();

export function createOnboardingRoutes(controller: OnboardingController): Router {
  // Apply authentication middleware to all routes
  router.use(authMiddleware);
  router.use(validateApiKey);

  // Apply rate limiting
  router.use(rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: 'Too many onboarding requests, please try again later'
  }));

  /**
   * @route POST /api/v1/onboarding/applications
   * @desc Create a new onboarding application
   * @access Private
   */
  router.post('/applications', controller.createApplication.bind(controller));

  /**
   * @route GET /api/v1/onboarding/applications/:id
   * @desc Get application by ID
   * @access Private
   */
  router.get('/applications/:id', controller.getApplication.bind(controller));

  /**
   * @route PUT /api/v1/onboarding/applications/:id/personal-info
   * @desc Update personal information
   * @access Private
   */
  router.put('/applications/:id/personal-info', controller.updatePersonalInfo.bind(controller));

  /**
   * @route PUT /api/v1/onboarding/applications/:id/business-info
   * @desc Update business information
   * @access Private
   */
  router.put('/applications/:id/business-info', controller.updateBusinessInfo.bind(controller));

  /**
   * @route POST /api/v1/onboarding/applications/:id/addresses
   * @desc Add address to application
   * @access Private
   */
  router.post('/applications/:id/addresses', controller.addAddress.bind(controller));

  /**
   * @route POST /api/v1/onboarding/applications/:id/identity-documents
   * @desc Add identity document to application
   * @access Private
   */
  router.post('/applications/:id/identity-documents', controller.addIdentityDocument.bind(controller));

  /**
   * @route POST /api/v1/onboarding/applications/:id/bank-accounts
   * @desc Add bank account to application
   * @access Private
   */
  router.post('/applications/:id/bank-accounts', controller.addBankAccount.bind(controller));

  /**
   * @route POST /api/v1/onboarding/applications/:id/submit
   * @desc Submit application for review
   * @access Private
   */
  router.post('/applications/:id/submit', controller.submitApplication.bind(controller));

  /**
   * @route POST /api/v1/onboarding/applications/:id/documents
   * @desc Upload document for application
   * @access Private
   */
  router.post(
    '/applications/:id/documents',
    controller.getUploadMiddleware(),
    controller.uploadDocument.bind(controller)
  );

  // Admin-only routes
  /**
   * @route POST /api/v1/onboarding/applications/:id/approve
   * @desc Approve application
   * @access Admin
   */
  router.post(
    '/applications/:id/approve',
    requireRole(['admin', 'compliance_officer']),
    controller.approveApplication.bind(controller)
  );

  /**
   * @route POST /api/v1/onboarding/applications/:id/reject
   * @desc Reject application
   * @access Admin
   */
  router.post(
    '/applications/:id/reject',
    requireRole(['admin', 'compliance_officer']),
    controller.rejectApplication.bind(controller)
  );

  /**
   * @route GET /api/v1/onboarding/stats
   * @desc Get onboarding statistics
   * @access Admin
   */
  router.get(
    '/stats',
    requireRole(['admin', 'analytics']),
    controller.getStats.bind(controller)
  );

  /**
   * @route GET /api/v1/onboarding/health
   * @desc Health check endpoint
   * @access Public
   */
  router.get('/health', controller.healthCheck.bind(controller));

  return router;
}

export default createOnboardingRoutes;