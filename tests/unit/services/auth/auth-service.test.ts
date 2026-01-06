import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '@services/auth/src/services/auth-service';

const mockSmeClient = {
  getUserByEmail: vi.fn(),
  getUser: vi.fn(),
  getPaymentAccounts: vi.fn(),
  getTransactions: vi.fn(),
  getKYCData: vi.fn()
};

vi.mock('@caas/sme-integration', () => ({
  SMEAPIClient: vi.fn(() => mockSmeClient)
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password')
  }
}));

vi.mock('speakeasy', () => ({
  default: {
    generateSecret: vi.fn(() => ({
      base32: 'BASE32SECRET',
      otpauth_url: 'otpauth://test'
    })),
    totp: {
      verify: vi.fn().mockReturnValue(true)
    }
  }
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr')
  }
}));

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticates user with valid credentials', async () => {
    mockSmeClient.getUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      permissions: ['business_owner'],
      kycStatus: 'verified'
    });

    const authService = new AuthService();

    const result = await authService.authenticateUser(
      { email: 'test@example.com', password: 'Password1!' },
      { ipAddress: '127.0.0.1', userAgent: 'Chrome' }
    );

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({
      id: 'user-1',
      email: 'test@example.com'
    });
    expect(result.tokens?.accessToken).toBeTypeOf('string');
    expect(result.tokens?.refreshToken).toBeTypeOf('string');
  });

  it('rejects invalid email format', async () => {
    const authService = new AuthService();

    const result = await authService.authenticateUser({
      email: 'not-an-email',
      password: 'Password1!'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid email format');
    expect(result.errorCode).toBe('INVALID_EMAIL');
  });

  it('returns invalid credentials when SME user is missing', async () => {
    mockSmeClient.getUserByEmail.mockRejectedValue(new Error('Not found'));

    const authService = new AuthService();

    const result = await authService.authenticateUser({
      email: 'missing@example.com',
      password: 'Password1!'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
    expect(result.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('returns invalid credentials when password validation fails', async () => {
    mockSmeClient.getUserByEmail.mockResolvedValue({
      id: 'user-2',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      permissions: ['business_owner'],
      kycStatus: 'verified'
    });

    const authService = new AuthService();
    vi.spyOn(authService as any, 'validateSMECredentials').mockResolvedValue(false);

    const result = await authService.authenticateUser({
      email: 'test@example.com',
      password: 'WrongPassword1!'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
    expect(result.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('requires two-factor authentication when enabled', async () => {
    mockSmeClient.getUserByEmail.mockResolvedValue({
      id: 'user-3',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      permissions: ['business_owner'],
      kycStatus: 'verified'
    });

    const authService = new AuthService();
    vi.spyOn(authService as any, 'userRequires2FA').mockResolvedValue(true);

    const result = await authService.authenticateUser({
      email: 'test@example.com',
      password: 'Password1!'
    });

    expect(result.success).toBe(false);
    expect(result.requiresTwoFactor).toBe(true);
    expect(result.errorCode).toBe('REQUIRES_2FA');
  });

  it('registers a new user with strong password', async () => {
    mockSmeClient.getUserByEmail.mockRejectedValue(new Error('Not found'));

    const authService = new AuthService();
    const registration = {
      email: 'newuser@example.com',
      password: 'StrongPass1!',
      firstName: 'New',
      lastName: 'User'
    };

    const result = await authService.registerUser(registration);

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe(registration.email);
    expect(result.verificationRequired).toBe(true);
  });

  it('rejects registration for existing user', async () => {
    mockSmeClient.getUserByEmail.mockResolvedValue({
      id: 'user-4',
      email: 'existing@example.com',
      firstName: 'Existing',
      lastName: 'User',
      permissions: [],
      kycStatus: 'verified'
    });

    const authService = new AuthService();
    const result = await authService.registerUser({
      email: 'existing@example.com',
      password: 'StrongPass1!',
      firstName: 'Existing',
      lastName: 'User'
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('USER_EXISTS');
  });

  it('rejects registration with weak password', async () => {
    mockSmeClient.getUserByEmail.mockRejectedValue(new Error('Not found'));

    const authService = new AuthService();
    const result = await authService.registerUser({
      email: 'weak@example.com',
      password: 'weak',
      firstName: 'Weak',
      lastName: 'Password'
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('WEAK_PASSWORD');
  });

  it('sets up two-factor authentication', async () => {
    mockSmeClient.getUser.mockResolvedValue({
      id: 'user-5',
      email: 'test@example.com'
    });

    const authService = new AuthService();
    const result = await authService.setupTwoFactor('user-5');

    expect(result.success).toBe(true);
    expect(result.secret).toBe('BASE32SECRET');
    expect(result.qrCodeUrl).toBe('data:image/png;base64,qr');
    expect(result.backupCodes).toHaveLength(10);
  });
});
