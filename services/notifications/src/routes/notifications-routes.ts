import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications-controller.js';

export function createNotificationsRoutes(controller: NotificationsController): Router {
  const router = Router();

  // Template management
  router.post('/templates', controller.createTemplate.bind(controller));
  router.get('/templates', controller.getTemplates.bind(controller));

  // Message sending
  router.post('/send', controller.sendNotification.bind(controller));
  router.post('/send/bulk', controller.sendBulkNotifications.bind(controller));

  // Campaign management
  router.post('/campaigns', controller.createCampaign.bind(controller));
  router.get('/campaigns', controller.getCampaigns.bind(controller));

  // Message management
  router.get('/messages', controller.getMessages.bind(controller));
  router.post('/messages/:messageId/process', controller.processDelivery.bind(controller));

  // Webhooks
  router.post('/webhooks/delivery', controller.handleWebhook.bind(controller));

  // Analytics
  router.get('/analytics', controller.getAnalytics.bind(controller));

  return router;
}