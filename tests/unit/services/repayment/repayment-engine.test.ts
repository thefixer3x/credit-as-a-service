import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { RepaymentEngine } from '@services/repayment/src/services/repayment-engine';
import { getTestDb } from '../../../utils/database';
import { creditLineFixtures } from '../../../fixtures/credit';

// Mock external dependencies
vi.mock('../../../utils/database');
vi.mock('@services/notifications/src/services/notification-service');

describe('RepaymentEngine', () => {
  let repaymentEngine: RepaymentEngine;
  let mockDb: any;
  let mockNotificationService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      eq: vi.fn(),
      transaction: vi.fn(),
    };

    (getTestDb as Mock).mockReturnValue(mockDb);

    // Mock notification service
    mockNotificationService = {
      sendNotification: vi.fn(),
      scheduleReminder: vi.fn(),
    };

    repaymentEngine = new RepaymentEngine();
    (repaymentEngine as any).notificationService = mockNotificationService;
  });

  describe('processPayment', () => {
    it('should process a successful payment', async () => {
      // Arrange
      const paymentData = {
        loanId: 'line-001',
        amount: 1313.13,
        paymentMethod: 'bank_transfer',
        userId: 'user-001',
      };

      const mockLoan = creditLineFixtures.activeCreditLine;
      const mockPaymentSchedule = {
        id: 'schedule-1',
        loanId: 'line-001',
        amount: 1313.13,
        principalAmount: 1163.13,
        interestAmount: 150.00,
        scheduledDate: new Date('2024-02-13'),
        status: 'scheduled',
      };

      // Mock database queries
      mockDb.where
        .mockResolvedValueOnce([mockLoan]) // Loan lookup
        .mockResolvedValueOnce([mockPaymentSchedule]); // Payment schedule lookup

      // Mock transaction
      mockDb.transaction.mockImplementation(async (callback: Function) => {
        const mockTrx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{
            id: 'payment-001',
            ...paymentData,
            status: 'completed',
            transactionId: 'txn-123',
            processedDate: new Date(),
          }]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        return await callback(mockTrx);
      });

      // Act
      const result = await repaymentEngine.processPayment(paymentData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.payment.status).toBe('completed');
      expect(result.payment.transactionId).toBeDefined();
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_successful',
          userId: paymentData.userId,
        })
      );
    });

    it('should handle insufficient funds', async () => {
      // Arrange
      const paymentData = {
        loanId: 'line-001',
        amount: 1313.13,
        paymentMethod: 'bank_transfer',
        userId: 'user-001',
      };

      const mockLoan = creditLineFixtures.activeCreditLine;

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([mockLoan]);

      // Mock failed payment processing
      vi.doMock('external-payment-service', () => ({
        processPayment: vi.fn().mockResolvedValue({
          success: false,
          error: 'Insufficient funds',
          errorCode: 'INSUFFICIENT_FUNDS',
        }),
      }));

      // Mock transaction
      mockDb.transaction.mockImplementation(async (callback: Function) => {
        const mockTrx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{
            id: 'payment-001',
            ...paymentData,
            status: 'failed',
            failureReason: 'Insufficient funds',
          }]),
        };
        return await callback(mockTrx);
      });

      // Act
      const result = await repaymentEngine.processPayment(paymentData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment processing failed');
      expect(result.payment.status).toBe('failed');
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_failed',
          userId: paymentData.userId,
        })
      );
    });

    it('should handle invalid loan', async () => {
      // Arrange
      const paymentData = {
        loanId: 'non-existent-loan',
        amount: 1313.13,
        paymentMethod: 'bank_transfer',
        userId: 'user-001',
      };

      // Mock database query to return no loan
      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await repaymentEngine.processPayment(paymentData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Loan not found');
      expect(result.errorCode).toBe('LOAN_NOT_FOUND');
    });

    it('should handle payment amount validation', async () => {
      // Arrange
      const paymentData = {
        loanId: 'line-001',
        amount: -100, // Invalid negative amount
        paymentMethod: 'bank_transfer',
        userId: 'user-001',
      };

      // Act
      const result = await repaymentEngine.processPayment(paymentData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid payment amount');
      expect(result.errorCode).toBe('INVALID_AMOUNT');
    });

    it('should handle overpayment gracefully', async () => {
      // Arrange
      const paymentData = {
        loanId: 'line-001',
        amount: 50000, // Much more than remaining balance
        paymentMethod: 'bank_transfer',
        userId: 'user-001',
      };

      const mockLoan = {
        ...creditLineFixtures.activeCreditLine,
        usedAmount: 1000, // Low remaining balance
      };

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([mockLoan]);

      // Mock transaction
      mockDb.transaction.mockImplementation(async (callback: Function) => {
        const mockTrx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{
            id: 'payment-001',
            loanId: paymentData.loanId,
            amount: 1000, // Adjusted to remaining balance
            status: 'completed',
            overpaymentRefund: 49000,
          }]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        return await callback(mockTrx);
      });

      // Act
      const result = await repaymentEngine.processPayment(paymentData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.payment.amount).toBe(1000);
      expect(result.payment.overpaymentRefund).toBe(49000);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'overpayment_processed',
        })
      );
    });
  });

  describe('generatePaymentSchedule', () => {
    it('should generate correct payment schedule for standard loan', async () => {
      // Arrange
      const loanData = {
        id: 'line-001',
        amount: 15000,
        interestRate: 0.085,
        termMonths: 12,
        startDate: new Date('2024-01-15'),
      };

      // Act
      const schedule = await repaymentEngine.generatePaymentSchedule(loanData);

      // Assert
      expect(schedule).toHaveLength(12);
      expect(schedule[0].paymentNumber).toBe(1);
      expect(schedule[0].scheduledDate).toEqual(new Date('2024-02-15'));
      expect(schedule[11].paymentNumber).toBe(12);
      
      // Check that payments add up to total loan amount plus interest
      const totalPayments = schedule.reduce((sum, payment) => sum + payment.amount, 0);
      const totalInterest = schedule.reduce((sum, payment) => sum + payment.interestAmount, 0);
      expect(totalPayments).toBeCloseTo(loanData.amount + totalInterest, 2);
      
      // Check that principal decreases over time (amortization)
      expect(schedule[0].principalAmount).toBeLessThan(schedule[11].principalAmount);
    });

    it('should generate schedule with different payment frequencies', async () => {
      // Arrange
      const loanData = {
        id: 'line-001',
        amount: 24000,
        interestRate: 0.09,
        termMonths: 24,
        startDate: new Date('2024-01-15'),
        paymentFrequency: 'bi-weekly' as const,
      };

      // Act
      const schedule = await repaymentEngine.generatePaymentSchedule(loanData);

      // Assert
      expect(schedule).toHaveLength(48); // 24 months * 2 bi-weekly payments
      expect(schedule[0].scheduledDate).toEqual(new Date('2024-01-29')); // 2 weeks after start
      expect(schedule[1].scheduledDate).toEqual(new Date('2024-02-12')); // 2 weeks later
    });

    it('should handle interest-only periods', async () => {
      // Arrange
      const loanData = {
        id: 'line-001',
        amount: 20000,
        interestRate: 0.08,
        termMonths: 24,
        startDate: new Date('2024-01-15'),
        interestOnlyMonths: 6,
      };

      // Act
      const schedule = await repaymentEngine.generatePaymentSchedule(loanData);

      // Assert
      expect(schedule).toHaveLength(24);
      
      // First 6 payments should be interest-only
      for (let i = 0; i < 6; i++) {
        expect(schedule[i].principalAmount).toBe(0);
        expect(schedule[i].interestAmount).toBeGreaterThan(0);
      }
      
      // Remaining payments should include principal
      for (let i = 6; i < 24; i++) {
        expect(schedule[i].principalAmount).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateEarlyPayoffAmount', () => {
    it('should calculate early payoff with standard prepayment penalty', async () => {
      // Arrange
      const loanId = 'line-001';
      const mockLoan = creditLineFixtures.activeCreditLine;
      const mockSchedule = [
        { amount: 1313.13, principalAmount: 1163.13, interestAmount: 150.00 },
        { amount: 1313.13, principalAmount: 1172.00, interestAmount: 141.13 },
        { amount: 1313.13, principalAmount: 1180.95, interestAmount: 132.18 },
      ];

      // Mock database queries
      mockDb.where
        .mockResolvedValueOnce([mockLoan])
        .mockResolvedValueOnce(mockSchedule);

      // Act
      const result = await repaymentEngine.calculateEarlyPayoffAmount(loanId);

      // Assert
      expect(result.remainingPrincipal).toBeGreaterThan(0);
      expect(result.prepaymentPenalty).toBeGreaterThan(0);
      expect(result.totalPayoffAmount).toBe(
        result.remainingPrincipal + result.prepaymentPenalty
      );
      expect(result.interestSavings).toBeGreaterThan(0);
    });

    it('should handle loans without prepayment penalty', async () => {
      // Arrange
      const loanId = 'line-001';
      const mockLoan = {
        ...creditLineFixtures.activeCreditLine,
        prepaymentPenaltyRate: 0, // No penalty
      };

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([mockLoan]);

      // Act
      const result = await repaymentEngine.calculateEarlyPayoffAmount(loanId);

      // Assert
      expect(result.prepaymentPenalty).toBe(0);
      expect(result.totalPayoffAmount).toBe(result.remainingPrincipal);
    });
  });

  describe('processAutomaticPayments', () => {
    it('should process due automatic payments', async () => {
      // Arrange
      const today = new Date('2024-02-15');
      vi.setSystemTime(today);

      const duePayments = [
        {
          id: 'schedule-1',
          loanId: 'line-001',
          userId: 'user-001',
          amount: 1313.13,
          scheduledDate: today,
          status: 'scheduled',
          paymentMethod: 'auto_debit',
        },
        {
          id: 'schedule-2',
          loanId: 'line-002',
          userId: 'user-002',
          amount: 1244.89,
          scheduledDate: today,
          status: 'scheduled',
          paymentMethod: 'auto_debit',
        },
      ];

      // Mock database query for due payments
      mockDb.where.mockResolvedValue(duePayments);

      // Mock successful payment processing
      vi.spyOn(repaymentEngine, 'processPayment').mockResolvedValue({
        success: true,
        payment: {
          id: 'payment-001',
          status: 'completed',
          transactionId: 'txn-123',
        },
      } as any);

      // Act
      const result = await repaymentEngine.processAutomaticPayments();

      // Assert
      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(repaymentEngine.processPayment).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in automatic payments', async () => {
      // Arrange
      const today = new Date('2024-02-15');
      vi.setSystemTime(today);

      const duePayments = [
        {
          id: 'schedule-1',
          loanId: 'line-001',
          userId: 'user-001',
          amount: 1313.13,
          scheduledDate: today,
          status: 'scheduled',
          paymentMethod: 'auto_debit',
        },
        {
          id: 'schedule-2',
          loanId: 'line-002',
          userId: 'user-002',
          amount: 1244.89,
          scheduledDate: today,
          status: 'scheduled',
          paymentMethod: 'auto_debit',
        },
      ];

      // Mock database query
      mockDb.where.mockResolvedValue(duePayments);

      // Mock mixed payment results
      vi.spyOn(repaymentEngine, 'processPayment')
        .mockResolvedValueOnce({
          success: true,
          payment: { id: 'payment-001', status: 'completed' },
        } as any)
        .mockResolvedValueOnce({
          success: false,
          error: 'Insufficient funds',
          payment: { id: 'payment-002', status: 'failed' },
        } as any);

      // Act
      const result = await repaymentEngine.processAutomaticPayments();

      // Assert
      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('sendPaymentReminders', () => {
    it('should send reminders for upcoming payments', async () => {
      // Arrange
      const upcomingPayments = [
        {
          id: 'schedule-1',
          loanId: 'line-001',
          userId: 'user-001',
          amount: 1313.13,
          scheduledDate: new Date('2024-02-18'), // 3 days from now
          status: 'scheduled',
        },
        {
          id: 'schedule-2',
          loanId: 'line-002',
          userId: 'user-002',
          amount: 1244.89,
          scheduledDate: new Date('2024-02-19'), // 4 days from now
          status: 'scheduled',
        },
      ];

      // Mock current date
      vi.setSystemTime(new Date('2024-02-15'));

      // Mock database query
      mockDb.where.mockResolvedValue(upcomingPayments);

      // Act
      await repaymentEngine.sendPaymentReminders();

      // Assert
      expect(mockNotificationService.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_due_reminder',
          userId: 'user-001',
        })
      );
    });

    it('should send overdue payment notifications', async () => {
      // Arrange
      const overduePayments = [
        {
          id: 'schedule-1',
          loanId: 'line-001',
          userId: 'user-001',
          amount: 1313.13,
          scheduledDate: new Date('2024-02-10'), // 5 days overdue
          status: 'scheduled',
        },
      ];

      // Mock current date
      vi.setSystemTime(new Date('2024-02-15'));

      // Mock database query
      mockDb.where.mockResolvedValue(overduePayments);

      // Act
      await repaymentEngine.sendPaymentReminders();

      // Assert
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_overdue',
          userId: 'user-001',
          priority: 'high',
        })
      );
    });
  });

  describe('handleFailedPayment', () => {
    it('should implement retry logic for failed payments', async () => {
      // Arrange
      const failedPayment = {
        id: 'payment-001',
        loanId: 'line-001',
        userId: 'user-001',
        amount: 1313.13,
        status: 'failed',
        failureReason: 'Insufficient funds',
        retryCount: 0,
      };

      // Mock database queries
      mockDb.where.mockResolvedValue([failedPayment]);

      // Act
      const result = await repaymentEngine.handleFailedPayment(failedPayment.id);

      // Assert
      expect(result.retryScheduled).toBe(true);
      expect(result.nextRetryDate).toBeInstanceOf(Date);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_retry_scheduled',
          userId: failedPayment.userId,
        })
      );
    });

    it('should stop retrying after maximum attempts', async () => {
      // Arrange
      const failedPayment = {
        id: 'payment-001',
        loanId: 'line-001',
        userId: 'user-001',
        amount: 1313.13,
        status: 'failed',
        failureReason: 'Card expired',
        retryCount: 3, // Maximum retries reached
      };

      // Mock database queries
      mockDb.where.mockResolvedValue([failedPayment]);

      // Act
      const result = await repaymentEngine.handleFailedPayment(failedPayment.id);

      // Assert
      expect(result.retryScheduled).toBe(false);
      expect(result.maxRetriesReached).toBe(true);
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_requires_attention',
          priority: 'critical',
        })
      );
    });
  });

  describe('calculateLateFees', () => {
    it('should calculate late fees correctly', () => {
      // Arrange
      const paymentAmount = 1313.13;
      const daysLate = 10;
      const lateFeeRate = 0.05; // 5% of payment amount

      // Act
      const lateFee = (repaymentEngine as any).calculateLateFees(
        paymentAmount,
        daysLate,
        lateFeeRate
      );

      // Assert
      expect(lateFee).toBeCloseTo(65.66, 2); // 5% of 1313.13
    });

    it('should apply maximum late fee cap', () => {
      // Arrange
      const paymentAmount = 5000;
      const daysLate = 30;
      const lateFeeRate = 0.10; // 10% would be $500
      const maxLateFee = 100;

      // Act
      const lateFee = (repaymentEngine as any).calculateLateFees(
        paymentAmount,
        daysLate,
        lateFeeRate,
        maxLateFee
      );

      // Assert
      expect(lateFee).toBe(100); // Capped at maximum
    });

    it('should have grace period for late fees', () => {
      // Arrange
      const paymentAmount = 1313.13;
      const daysLate = 5; // Within grace period
      const lateFeeRate = 0.05;
      const gracePeriodDays = 10;

      // Act
      const lateFee = (repaymentEngine as any).calculateLateFees(
        paymentAmount,
        daysLate,
        lateFeeRate,
        undefined,
        gracePeriodDays
      );

      // Assert
      expect(lateFee).toBe(0); // No fee within grace period
    });
  });
});