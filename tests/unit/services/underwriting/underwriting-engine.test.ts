import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnderwritingEngine } from '@services/underwriting/src/services/underwriting-engine';

const mockSmeClient = {
  getUser: vi.fn(),
  getPaymentAccounts: vi.fn(),
  getTransactions: vi.fn(),
  getAccountBalance: vi.fn(),
  getKYCData: vi.fn()
};

vi.mock('@caas/sme-integration', () => ({
  SMEAPIClient: vi.fn(() => mockSmeClient)
}));

vi.mock('@tensorflow/tfjs-node', () => ({
  tensor2d: vi.fn()
}));

describe('UnderwritingEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves low-risk applications with strong profiles', async () => {
    mockSmeClient.getUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      kycStatus: 'verified',
      permissions: [],
      businessId: 'biz-1',
      createdAt: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString()
    });

    mockSmeClient.getPaymentAccounts.mockResolvedValue([
      { id: 'acct-1' }
    ]);

    mockSmeClient.getTransactions.mockResolvedValue([
      { type: 'credit', status: 'completed', amount: 300000 },
      { type: 'debit', status: 'completed', amount: 60000 }
    ]);

    mockSmeClient.getAccountBalance.mockResolvedValue({ balance: 150000, currency: 'NGN' });
    mockSmeClient.getKYCData.mockResolvedValue({ status: 'verified' });

    const engine = new UnderwritingEngine();

    const assessment = await engine.assessCreditApplication({
      userId: 'user-1',
      applicationId: 'app-1',
      requestedAmount: 200000,
      currency: 'NGN',
      purpose: 'Working capital'
    });

    expect(assessment.riskScore).toBeGreaterThanOrEqual(800);
    expect(assessment.riskGrade).toBe('A');
    expect(assessment.recommendation).toBe('approve');
    expect(assessment.recommendedAmount).toBe(200000);
  });

  it('rejects applications when KYC is not verified', async () => {
    mockSmeClient.getUser.mockResolvedValue({
      id: 'user-2',
      email: 'user2@example.com',
      kycStatus: 'pending',
      permissions: [],
      businessId: 'biz-2',
      createdAt: new Date().toISOString()
    });

    mockSmeClient.getPaymentAccounts.mockResolvedValue([]);
    mockSmeClient.getTransactions.mockResolvedValue([]);
    mockSmeClient.getAccountBalance.mockResolvedValue({ balance: 0, currency: 'NGN' });
    mockSmeClient.getKYCData.mockResolvedValue({ status: 'pending' });

    const engine = new UnderwritingEngine();

    const assessment = await engine.assessCreditApplication({
      userId: 'user-2',
      applicationId: 'app-2',
      requestedAmount: 500000,
      currency: 'NGN',
      purpose: 'Inventory financing'
    });

    expect(assessment.recommendation).toBe('reject');
    expect(assessment.conditions).toContain('KYC verification required');
  });
});
