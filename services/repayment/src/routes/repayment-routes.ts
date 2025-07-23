import { Router } from 'express';
import { RepaymentController } from '../controllers/repayment-controller.js';

export function createRepaymentRoutes(controller: RepaymentController): Router {
  const router = Router();

  // Schedule management routes
  router.post('/schedules', controller.createSchedule.bind(controller));
  router.get('/schedules/:scheduleId', controller.getSchedule.bind(controller));
  router.get('/schedules', controller.getUserSchedules.bind(controller));

  // Payment processing routes
  router.post('/schedules/:scheduleId/payments', controller.processPayment.bind(controller));
  router.post('/schedules/:scheduleId/early-payment', controller.processEarlyPayment.bind(controller));

  // Auto debit management
  router.post('/schedules/:scheduleId/auto-debit', controller.setupAutoDebit.bind(controller));

  // Payment reminders
  router.post('/payments/:paymentId/reminder', controller.sendPaymentReminder.bind(controller));

  // Payment plans
  router.post('/schedules/:scheduleId/payment-plan', controller.createPaymentPlan.bind(controller));

  // Analytics
  router.get('/schedules/:scheduleId/analytics', controller.getAnalytics.bind(controller));

  return router;
}