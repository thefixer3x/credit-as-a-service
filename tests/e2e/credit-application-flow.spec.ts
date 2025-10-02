import { test, expect, Page } from '@playwright/test';
import { TestWebSocketClient } from '../utils/websocket';
import { createTestUser, generateTestJWT } from '../utils/auth';

test.describe('Credit Application End-to-End Flow', () => {
  let page: Page;
  let wsClient: TestWebSocketClient;
  let testUser: any;
  let authToken: string;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Create test user and auth token
    testUser = createTestUser({
      email: 'e2e-user@example.com',
      firstName: 'E2E',
      lastName: 'User',
    });
    authToken = generateTestJWT(testUser);

    // Setup WebSocket client for real-time notifications
    wsClient = new TestWebSocketClient();
    await wsClient.connect(authToken);
    
    // Subscribe to relevant channels
    wsClient.subscribe(['loans', 'payments'], testUser.id, ['user']);

    // Navigate to application and set auth token
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify({
        id: 'e2e-user-id',
        email: 'e2e-user@example.com',
        firstName: 'E2E',
        lastName: 'User',
        role: 'user',
      }));
    }, authToken);

    // Reload to apply auth state
    await page.reload();
  });

  test.afterEach(async () => {
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  test('Complete credit application journey from application to loan disbursement', async () => {
    // Step 1: Navigate to credit application page
    await test.step('Navigate to credit application', async () => {
      await page.goto('/dashboard/apply');
      await expect(page.locator('h1')).toContainText('Apply for Credit');
    });

    // Step 2: Fill out credit application form
    await test.step('Fill out application form', async () => {
      // Personal Information
      await page.fill('[data-testid="loan-amount"]', '25000');
      await page.selectOption('[data-testid="loan-purpose"]', 'business_expansion');
      await page.fill('[data-testid="loan-description"]', 'Equipment purchase for expanding manufacturing capacity');
      await page.selectOption('[data-testid="loan-term"]', '24');

      // Business Information
      await page.fill('[data-testid="business-name"]', 'E2E Test Manufacturing LLC');
      await page.fill('[data-testid="business-revenue"]', '500000');
      await page.fill('[data-testid="business-employees"]', '15');
      await page.selectOption('[data-testid="business-industry"]', 'manufacturing');

      // Financial Information
      await page.fill('[data-testid="monthly-revenue"]', '42000');
      await page.fill('[data-testid="monthly-expenses"]', '35000');
      await page.fill('[data-testid="existing-debt"]', '75000');

      // Upload required documents
      await page.setInputFiles('[data-testid="business-license-upload"]', {
        name: 'business-license.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('Mock business license content'),
      });

      await page.setInputFiles('[data-testid="financial-statements-upload"]', {
        name: 'financial-statements.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('Mock financial statements content'),
      });

      // Accept terms and conditions
      await page.check('[data-testid="terms-checkbox"]');
      await page.check('[data-testid="privacy-checkbox"]');
    });

    // Step 3: Submit application
    await test.step('Submit application', async () => {
      await page.click('[data-testid="submit-application"]');
      
      // Wait for success message
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Application submitted successfully');
      
      // Should have application ID
      const applicationId = await page.locator('[data-testid="application-id"]').textContent();
      expect(applicationId).toMatch(/^app-\w+/);
    });

    // Step 4: Verify real-time notification
    await test.step('Receive application submission notification', async () => {
      const notification = await wsClient.waitForMessage('notification', 5000);
      expect(notification.type).toBe('application_submitted');
      expect(notification.title).toContain('Application Submitted');
    });

    // Step 5: Navigate to applications dashboard
    await test.step('View application in dashboard', async () => {
      await page.goto('/dashboard/applications');
      await expect(page.locator('h1')).toContainText('My Applications');
      
      // Should see the submitted application
      const applicationRow = page.locator('[data-testid="application-row"]').first();
      await expect(applicationRow).toBeVisible();
      await expect(applicationRow.locator('[data-testid="application-amount"]')).toContainText('$25,000');
      await expect(applicationRow.locator('[data-testid="application-status"]')).toContainText('Pending');
    });

    // Step 6: Simulate underwriting process (admin actions)
    await test.step('Simulate underwriting completion', async () => {
      // This would typically be done by admin/underwriter
      // For E2E test, we'll simulate the process via API call
      const response = await page.request.post('/api/admin/applications/process', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          applicationId: 'latest', // Use latest application
          decision: 'approve',
          riskScore: 750,
          recommendedAmount: 25000,
          interestRate: 0.085,
          termMonths: 24,
        },
      });
      
      expect(response.status()).toBe(200);
    });

    // Step 7: Receive approval notification
    await test.step('Receive approval notification', async () => {
      const notification = await wsClient.waitForMessage('notification', 10000);
      expect(notification.type).toBe('application_approved');
      expect(notification.title).toContain('Application Approved');
    });

    // Step 8: View credit offers
    await test.step('View and accept credit offer', async () => {
      await page.reload(); // Refresh to see updated status
      
      // Click on approved application
      await page.click('[data-testid="application-row"]:has([data-testid="application-status"]:has-text("Approved"))');
      
      // Should navigate to application details
      await expect(page.locator('h1')).toContainText('Application Details');
      await expect(page.locator('[data-testid="application-status"]')).toContainText('Approved');
      
      // View offers section
      const offersSection = page.locator('[data-testid="offers-section"]');
      await expect(offersSection).toBeVisible();
      
      // Should see at least one offer
      const offer = offersSection.locator('[data-testid="credit-offer"]').first();
      await expect(offer).toBeVisible();
      await expect(offer.locator('[data-testid="offer-amount"]')).toContainText('$25,000');
      await expect(offer.locator('[data-testid="offer-rate"]')).toContainText('8.5%');
      await expect(offer.locator('[data-testid="offer-term"]')).toContainText('24 months');
      
      // Calculate and verify monthly payment
      const monthlyPayment = offer.locator('[data-testid="monthly-payment"]');
      await expect(monthlyPayment).toContainText('$1,'); // Should be around $1,156
      
      // Accept the offer
      await offer.locator('[data-testid="accept-offer"]').click();
      
      // Confirm acceptance in modal
      await expect(page.locator('[data-testid="confirm-modal"]')).toBeVisible();
      await page.click('[data-testid="confirm-accept"]');
      
      // Wait for success message
      await expect(page.locator('[data-testid="offer-accepted-message"]')).toBeVisible();
    });

    // Step 9: Receive offer acceptance notification
    await test.step('Receive offer acceptance notification', async () => {
      const notification = await wsClient.waitForMessage('notification', 5000);
      expect(notification.type).toBe('offer_accepted');
      expect(notification.title).toContain('Offer Accepted');
    });

    // Step 10: Navigate to active loans
    await test.step('View active loan', async () => {
      await page.goto('/dashboard/loans');
      await expect(page.locator('h1')).toContainText('My Loans');
      
      // Should see the new active loan
      const loanRow = page.locator('[data-testid="loan-row"]').first();
      await expect(loanRow).toBeVisible();
      await expect(loanRow.locator('[data-testid="loan-amount"]')).toContainText('$25,000');
      await expect(loanRow.locator('[data-testid="loan-status"]')).toContainText('Active');
      
      // Click to view loan details
      await loanRow.click();
    });

    // Step 11: View loan details and payment schedule
    await test.step('View loan details and payment schedule', async () => {
      await expect(page.locator('h1')).toContainText('Loan Details');
      
      // Verify loan information
      await expect(page.locator('[data-testid="loan-principal"]')).toContainText('$25,000');
      await expect(page.locator('[data-testid="loan-rate"]')).toContainText('8.5%');
      await expect(page.locator('[data-testid="loan-term"]')).toContainText('24 months');
      
      // Check payment schedule
      const paymentSchedule = page.locator('[data-testid="payment-schedule"]');
      await expect(paymentSchedule).toBeVisible();
      
      // Should have 24 payment rows
      const paymentRows = paymentSchedule.locator('[data-testid="payment-row"]');
      await expect(paymentRows).toHaveCount(24);
      
      // First payment should be scheduled for next month
      const firstPayment = paymentRows.first();
      await expect(firstPayment.locator('[data-testid="payment-date"]')).toBeVisible();
      await expect(firstPayment.locator('[data-testid="payment-amount"]')).toContainText('$1,');
      await expect(firstPayment.locator('[data-testid="payment-status"]')).toContainText('Scheduled');
    });

    // Step 12: Make a payment
    await test.step('Make first loan payment', async () => {
      // Navigate to make payment
      await page.click('[data-testid="make-payment-button"]');
      
      // Should open payment modal
      await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible();
      
      // Payment amount should be pre-filled with scheduled amount
      const paymentAmount = await page.locator('[data-testid="payment-amount"]').inputValue();
      expect(parseFloat(paymentAmount.replace(/[^0-9.]/g, ''))).toBeGreaterThan(1100);
      
      // Select payment method
      await page.selectOption('[data-testid="payment-method"]', 'bank_transfer');
      
      // Enter bank account details (in real app, this would be saved)
      await page.fill('[data-testid="account-number"]', '****1234');
      await page.fill('[data-testid="routing-number"]', '021000021');
      
      // Submit payment
      await page.click('[data-testid="submit-payment"]');
      
      // Wait for payment processing
      await expect(page.locator('[data-testid="processing-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="processing-message"]')).toContainText('Processing payment');
      
      // Wait for success (or failure in case of insufficient funds)
      await page.waitForSelector('[data-testid="payment-result"]', { timeout: 10000 });
      
      const paymentResult = page.locator('[data-testid="payment-result"]');
      const resultText = await paymentResult.textContent();
      
      // Could be successful or failed depending on mock payment gateway
      if (resultText?.includes('successful')) {
        await expect(paymentResult).toContainText('Payment processed successfully');
      } else {
        await expect(paymentResult).toContainText('Payment failed');
      }
    });

    // Step 13: Receive payment notification
    await test.step('Receive payment notification', async () => {
      const notification = await wsClient.waitForMessage('notification', 10000);
      expect(['payment_successful', 'payment_failed']).toContain(notification.type);
    });

    // Step 14: Verify payment history
    await test.step('Verify payment appears in history', async () => {
      // Close payment modal if still open
      if (await page.locator('[data-testid="payment-modal"]').isVisible()) {
        await page.click('[data-testid="close-modal"]');
      }
      
      // Navigate to payment history
      await page.goto('/dashboard/payments');
      await expect(page.locator('h1')).toContainText('Payment History');
      
      // Should see the payment we just made
      const paymentRow = page.locator('[data-testid="payment-row"]').first();
      await expect(paymentRow).toBeVisible();
      
      const paymentStatus = paymentRow.locator('[data-testid="payment-status"]');
      const statusText = await paymentStatus.textContent();
      
      // Verify payment details
      expect(['Completed', 'Failed', 'Processing']).toContain(statusText);
      await expect(paymentRow.locator('[data-testid="payment-amount"]')).toContainText('$1,');
      await expect(paymentRow.locator('[data-testid="payment-method"]')).toContainText('Bank Transfer');
    });

    // Step 15: Test notification center
    await test.step('View all notifications in notification center', async () => {
      // Click notification bell icon
      await page.click('[data-testid="notification-bell"]');
      
      // Should open notification dropdown/panel
      await expect(page.locator('[data-testid="notification-panel"]')).toBeVisible();
      
      // Should see notifications from our journey
      const notifications = page.locator('[data-testid="notification-item"]');
      await expect(notifications).toHaveCount.greaterThan(2);
      
      // Check for specific notification types
      const notificationTexts = await notifications.allTextContents();
      expect(notificationTexts.some(text => text.includes('Application Submitted'))).toBe(true);
      expect(notificationTexts.some(text => text.includes('Application Approved'))).toBe(true);
      expect(notificationTexts.some(text => text.includes('Offer Accepted'))).toBe(true);
      
      // Mark first notification as read
      await notifications.first().click();
      
      // Should show read status
      const firstNotification = notifications.first();
      await expect(firstNotification.locator('[data-testid="read-indicator"]')).toBeVisible();
    });

    // Step 16: Test loan dashboard overview
    await test.step('Verify loan dashboard shows updated information', async () => {
      await page.goto('/dashboard');
      await expect(page.locator('h1')).toContainText('Dashboard');
      
      // Should see loan summary
      const loanSummary = page.locator('[data-testid="loan-summary"]');
      await expect(loanSummary).toBeVisible();
      await expect(loanSummary.locator('[data-testid="total-borrowed"]')).toContainText('$25,000');
      await expect(loanSummary.locator('[data-testid="active-loans"]')).toContainText('1');
      
      // Should see payment summary
      const paymentSummary = page.locator('[data-testid="payment-summary"]');
      await expect(paymentSummary).toBeVisible();
      
      // Should show next payment due
      const nextPayment = paymentSummary.locator('[data-testid="next-payment"]');
      await expect(nextPayment).toBeVisible();
      await expect(nextPayment.locator('[data-testid="next-payment-amount"]')).toContainText('$1,');
      
      // Credit score section
      const creditSection = page.locator('[data-testid="credit-section"]');
      await expect(creditSection).toBeVisible();
      await expect(creditSection.locator('[data-testid="credit-score"]')).toContainText(/\d{3}/); // 3-digit score
    });
  });

  test('Credit application rejection flow', async () => {
    // Step 1: Submit application with poor credit profile
    await test.step('Submit application with poor credit indicators', async () => {
      await page.goto('/dashboard/apply');
      
      // Fill form with indicators that would lead to rejection
      await page.fill('[data-testid="loan-amount"]', '100000'); // Very high amount
      await page.selectOption('[data-testid="loan-purpose"]', 'debt_consolidation');
      await page.fill('[data-testid="business-revenue"]', '50000'); // Low revenue
      await page.fill('[data-testid="existing-debt"]', '200000'); // Very high existing debt
      await page.fill('[data-testid="monthly-expenses"]', '45000'); // Higher than revenue
      
      await page.check('[data-testid="terms-checkbox"]');
      await page.click('[data-testid="submit-application"]');
      
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    // Step 2: Simulate rejection
    await test.step('Simulate underwriting rejection', async () => {
      const response = await page.request.post('/api/admin/applications/process', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          applicationId: 'latest',
          decision: 'reject',
          riskScore: 450,
          rejectionReason: 'High debt-to-income ratio and insufficient revenue to support requested loan amount',
        },
      });
      
      expect(response.status()).toBe(200);
    });

    // Step 3: Receive rejection notification
    await test.step('Receive rejection notification', async () => {
      const notification = await wsClient.waitForMessage('notification', 10000);
      expect(notification.type).toBe('application_rejected');
      expect(notification.title).toContain('Application Rejected');
    });

    // Step 4: View rejection details
    await test.step('View rejection details and recommendations', async () => {
      await page.goto('/dashboard/applications');
      
      const rejectedApplication = page.locator('[data-testid="application-row"]:has([data-testid="application-status"]:has-text("Rejected"))');
      await rejectedApplication.click();
      
      // Should show rejection details
      await expect(page.locator('[data-testid="rejection-reason"]')).toBeVisible();
      await expect(page.locator('[data-testid="rejection-reason"]')).toContainText('debt-to-income');
      
      // Should show recommendations for improvement
      const recommendations = page.locator('[data-testid="improvement-recommendations"]');
      await expect(recommendations).toBeVisible();
      await expect(recommendations.locator('[data-testid="recommendation-item"]')).toHaveCount.greaterThan(0);
    });
  });

  test('Payment failure and retry flow', async () => {
    // Setup: Assume we have an active loan from previous test or setup
    await test.step('Setup active loan with scheduled payment', async () => {
      // This would typically be set up in beforeEach or through database seeding
      await page.goto('/dashboard/loans');
      
      // Click on active loan
      await page.click('[data-testid="loan-row"]:has([data-testid="loan-status"]:has-text("Active"))');
    });

    // Step 1: Attempt payment that will fail
    await test.step('Attempt payment with insufficient funds', async () => {
      await page.click('[data-testid="make-payment-button"]');
      
      // Select payment method that will simulate failure
      await page.selectOption('[data-testid="payment-method"]', 'credit_card');
      await page.fill('[data-testid="card-number"]', '4000000000000002'); // Test card that fails
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      
      await page.click('[data-testid="submit-payment"]');
      
      // Wait for failure
      await expect(page.locator('[data-testid="payment-result"]')).toContainText('Payment failed');
      await expect(page.locator('[data-testid="failure-reason"]')).toContainText('Insufficient funds');
    });

    // Step 2: Receive failure notification
    await test.step('Receive payment failure notification', async () => {
      const notification = await wsClient.waitForMessage('notification', 5000);
      expect(notification.type).toBe('payment_failed');
    });

    // Step 3: Retry payment
    await test.step('Retry payment with valid payment method', async () => {
      await page.click('[data-testid="retry-payment"]');
      
      // Use different payment method
      await page.selectOption('[data-testid="payment-method"]', 'bank_transfer');
      await page.fill('[data-testid="account-number"]', '****5678');
      await page.fill('[data-testid="routing-number"]', '021000021');
      
      await page.click('[data-testid="submit-payment"]');
      
      // Should succeed this time
      await expect(page.locator('[data-testid="payment-result"]')).toContainText('Payment processed successfully');
    });

    // Step 4: Verify retry success
    await test.step('Verify successful retry notification and payment history', async () => {
      const notification = await wsClient.waitForMessage('notification', 5000);
      expect(notification.type).toBe('payment_successful');
      
      // Check payment history shows both attempts
      await page.goto('/dashboard/payments');
      const paymentRows = page.locator('[data-testid="payment-row"]');
      await expect(paymentRows).toHaveCount(2); // Failed + successful
    });
  });
});