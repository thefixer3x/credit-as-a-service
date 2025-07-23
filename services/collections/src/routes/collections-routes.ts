import { Router } from 'express';
import { CollectionsController } from '../controllers/collections-controller.js';

export function createCollectionsRoutes(controller: CollectionsController): Router {
  const router = Router();

  // Delinquency case management
  router.post('/cases', controller.createDelinquencyCase.bind(controller));
  router.get('/cases/:caseId', controller.getCaseDetails.bind(controller));
  router.put('/cases/:caseId/assignment', controller.updateCaseAssignment.bind(controller));

  // Collection actions
  router.post('/cases/:caseId/actions', controller.createCollectionAction.bind(controller));
  router.put('/actions/:actionId/complete', controller.completeCollectionAction.bind(controller));

  // Hardship plans
  router.post('/cases/:caseId/hardship-plan', controller.createHardshipPlan.bind(controller));

  // Payment promises
  router.post('/cases/:caseId/promise', controller.recordPaymentPromise.bind(controller));

  // Disputes
  router.post('/cases/:caseId/dispute', controller.createDisputeCase.bind(controller));

  // Legal referrals
  router.post('/cases/:caseId/legal-referral', controller.createLegalReferral.bind(controller));

  // Agent management
  router.get('/agent/cases', controller.getCasesByAgent.bind(controller));

  // Analytics and reporting
  router.get('/analytics', controller.getAnalytics.bind(controller));

  return router;
}