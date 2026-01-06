import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RepaymentEngine } from '@services/repayment/src/services/repayment-engine';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn()
    }))
  }
}));

const createCache = () => {
  const store = new Map<string, any>();
  return {
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key: string, value: any) => {
      store.set(key, value);
      return true;
    }),
    _store: store
  };
};

const buildSchedule = (overrides: Partial<any> = {}) => ({
  id: 'schedule-1',
  creditApplicationId: 'credit-1',
  userId: 'user-1',
  principalAmount: 1000,
  interestRate: 12,
  termMonths: 12,
  paymentFrequency: 'monthly',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  totalAmount: 1120,
  totalInterest: 120,
  payments: [],
  status: 'active',
  gracePeriodDays: 5,
  lateFeePercentage: 2.5,
  compoundingType: 'compound',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
});

const paymentMethod = {
  type: 'bank_transfer',
  isDefault: true,
  isVerified: true
};

describe('RepaymentEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates repayment schedules and caches them', async () => {
    const cache = createCache();
    const repaymentEngine = new RepaymentEngine(cache as any);

    const schedule = await repaymentEngine.createSchedule(
      'credit-1',
      'user-1',
      12000,
      12,
      12,
      'monthly',
      new Date('2024-01-02')
    );

    expect(schedule.creditApplicationId).toBe('credit-1');
    expect(schedule.userId).toBe('user-1');
    expect(schedule.payments.length).toBe(12);
    expect(cache.set).toHaveBeenCalledWith(
      `schedule:${schedule.id}`,
      schedule,
      expect.any(Number)
    );
  });

  it('processes payments and updates schedule status', async () => {
    const cache = createCache();
    const repaymentEngine = new RepaymentEngine(cache as any);

    const scheduledPayment = {
      id: 'payment-1',
      scheduleId: 'schedule-1',
      paymentNumber: 1,
      dueDate: new Date('2024-02-01'),
      principalAmount: 1000,
      interestAmount: 100,
      totalAmount: 1100,
      remainingPrincipal: 0,
      status: 'pending',
      retryCount: 0
    };

    const schedule = buildSchedule({
      payments: [scheduledPayment],
      totalAmount: 1100,
      totalInterest: 100,
      endDate: new Date('2024-02-01')
    });

    await cache.set(`schedule:${schedule.id}`, schedule);

    vi.spyOn(repaymentEngine as any, 'processWithProvider').mockImplementation(async (transaction: any) => ({
      ...transaction,
      status: 'completed',
      processedAt: new Date(),
      completedAt: new Date(),
      externalReference: 'EXT-123',
      netAmount: transaction.amount
    }));

    const result = await repaymentEngine.processPayment(
      schedule.id,
      scheduledPayment.id,
      scheduledPayment.totalAmount,
      paymentMethod
    );

    expect(result.status).toBe('completed');

    const updatedSchedule = await cache.get(`schedule:${schedule.id}`);
    expect(updatedSchedule.payments[0].status).toBe('paid');
    expect(updatedSchedule.status).toBe('completed');
  });

  it('processes early payments with calculated savings', async () => {
    const cache = createCache();
    const repaymentEngine = new RepaymentEngine(cache as any);

    const schedule = buildSchedule({
      payments: [
        {
          id: 'payment-1',
          scheduleId: 'schedule-1',
          paymentNumber: 1,
          dueDate: new Date('2024-02-01'),
          principalAmount: 500,
          interestAmount: 50,
          totalAmount: 550,
          remainingPrincipal: 500,
          status: 'pending',
          retryCount: 0
        },
        {
          id: 'payment-2',
          scheduleId: 'schedule-1',
          paymentNumber: 2,
          dueDate: new Date('2024-03-01'),
          principalAmount: 500,
          interestAmount: 50,
          totalAmount: 550,
          remainingPrincipal: 0,
          status: 'pending',
          retryCount: 0
        }
      ]
    });

    await cache.set(`schedule:${schedule.id}`, schedule);

    const earlyPayment = await repaymentEngine.processEarlyPayment(
      schedule.id,
      200,
      schedule.userId
    );

    expect(earlyPayment.principalReduction).toBe(200);
    expect(earlyPayment.interestSavings).toBeCloseTo(12, 2);
    expect(earlyPayment.netSavings).toBeCloseTo(10, 2);
    expect(earlyPayment.newEndDate.getTime()).toBeLessThan(schedule.endDate.getTime());
  });

  it('generates analytics from schedule data', async () => {
    const cache = createCache();
    const repaymentEngine = new RepaymentEngine(cache as any);

    const schedule = buildSchedule({
      payments: [
        {
          id: 'payment-1',
          scheduleId: 'schedule-1',
          paymentNumber: 1,
          dueDate: new Date('2024-02-01'),
          principalAmount: 100,
          interestAmount: 10,
          totalAmount: 110,
          remainingPrincipal: 900,
          status: 'paid',
          paidAmount: 110,
          paidDate: new Date('2024-02-01'),
          retryCount: 0
        },
        {
          id: 'payment-2',
          scheduleId: 'schedule-1',
          paymentNumber: 2,
          dueDate: new Date('2024-03-01'),
          principalAmount: 100,
          interestAmount: 10,
          totalAmount: 110,
          remainingPrincipal: 800,
          status: 'overdue',
          retryCount: 0,
          daysPastDue: 5
        },
        {
          id: 'payment-3',
          scheduleId: 'schedule-1',
          paymentNumber: 3,
          dueDate: new Date('2024-04-01'),
          principalAmount: 100,
          interestAmount: 10,
          totalAmount: 110,
          remainingPrincipal: 700,
          status: 'pending',
          retryCount: 0
        }
      ]
    });

    await cache.set(`schedule:${schedule.id}`, schedule);

    const analytics = await repaymentEngine.generateAnalytics(schedule.id);

    expect(analytics.totalPaidAmount).toBe(110);
    expect(analytics.totalOutstandingAmount).toBe(110);
    expect(analytics.missedPayments).toBe(1);
    expect(analytics.remainingPayments).toBe(1);
    expect(analytics.paymentSuccessRate).toBeCloseTo(1 / 3, 2);
  });
});
