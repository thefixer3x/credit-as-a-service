import { Router } from 'express';
import { LedgerController } from '../controllers/ledger-controller.js';

export function createLedgerRoutes(controller: LedgerController): Router {
  const router = Router();

  // Account management
  router.post('/accounts', controller.createAccount.bind(controller));
  router.get('/accounts', controller.getChartOfAccounts.bind(controller));
  router.get('/accounts/:accountId/balance', controller.getAccountBalance.bind(controller));

  // Journal entry management
  router.post('/journal-entries', controller.createJournalEntry.bind(controller));
  router.get('/journal-entries', controller.getJournalEntries.bind(controller));
  router.post('/journal-entries/:entryId/post', controller.postJournalEntry.bind(controller));
  router.post('/journal-entries/:entryId/reverse', controller.reverseJournalEntry.bind(controller));

  // Ledger transactions
  router.post('/transactions', controller.createLedgerTransaction.bind(controller));

  // Reports
  router.get('/trial-balance', controller.generateTrialBalance.bind(controller));

  // Analytics
  router.get('/analytics', controller.getAnalytics.bind(controller));

  return router;
}