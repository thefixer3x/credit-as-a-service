import { http, HttpResponse } from 'msw';
import { testConfig } from '../../setup/test-env';

export const authHandlers = [
  // Mock login endpoint
  http.post(`${testConfig.api.baseUrl}/auth/login`, async ({ request }) => {
    const body = await request.json() as any;
    const { email, password } = body;

    // Mock successful login
    if (email === 'test@example.com' && password === 'password') {
      return HttpResponse.json({
        success: true,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'user',
          status: 'active',
        },
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 3600,
        },
      });
    }

    // Mock admin login
    if (email === 'admin@example.com' && password === 'admin') {
      return HttpResponse.json({
        success: true,
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          status: 'active',
        },
        tokens: {
          accessToken: 'mock-admin-token',
          refreshToken: 'mock-admin-refresh-token',
          expiresIn: 3600,
        },
      });
    }

    // Mock invalid credentials
    return HttpResponse.json(
      {
        success: false,
        error: 'Invalid credentials',
        errorCode: 'INVALID_CREDENTIALS',
      },
      { status: 401 }
    );
  }),

  // Mock register endpoint
  http.post(`${testConfig.api.baseUrl}/auth/register`, async ({ request }) => {
    const body = await request.json() as any;
    const { email, password, firstName, lastName } = body;

    // Mock email already exists
    if (email === 'existing@example.com') {
      return HttpResponse.json(
        {
          success: false,
          error: 'Email already exists',
          errorCode: 'EMAIL_EXISTS',
        },
        { status: 409 }
      );
    }

    // Mock successful registration
    return HttpResponse.json(
      {
        success: true,
        user: {
          id: `user-${Date.now()}`,
          email,
          firstName,
          lastName,
          role: 'user',
          status: 'pending_verification',
        },
        verificationRequired: true,
      },
      { status: 201 }
    );
  }),

  // Mock refresh token endpoint
  http.post(`${testConfig.api.baseUrl}/auth/refresh`, async ({ request }) => {
    const body = await request.json() as any;
    const { refreshToken } = body;

    if (refreshToken === 'mock-refresh-token') {
      return HttpResponse.json({
        success: true,
        tokens: {
          accessToken: 'new-mock-access-token',
          expiresIn: 3600,
        },
      });
    }

    return HttpResponse.json(
      {
        success: false,
        error: 'Invalid refresh token',
      },
      { status: 401 }
    );
  }),

  // Mock user profile endpoint
  http.get(`${testConfig.api.baseUrl}/auth/me`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    
    if (token === 'mock-access-token') {
      return HttpResponse.json({
        success: true,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'user',
          status: 'active',
          kycStatus: 'verified',
        },
      });
    }

    if (token === 'mock-admin-token') {
      return HttpResponse.json({
        success: true,
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          status: 'active',
          kycStatus: 'verified',
        },
      });
    }

    return HttpResponse.json(
      {
        success: false,
        error: 'Invalid token',
      },
      { status: 401 }
    );
  }),

  // Mock logout endpoint
  http.post(`${testConfig.api.baseUrl}/auth/logout`, () => {
    return HttpResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  }),

  // Mock 2FA setup
  http.post(`${testConfig.api.baseUrl}/auth/2fa/setup`, () => {
    return HttpResponse.json({
      success: true,
      secret: 'MOCK2FASECRET123',
      qrCodeUrl: 'data:image/png;base64,mock-qr-code',
      backupCodes: ['123456', '789012', '345678'],
    });
  }),

  // Mock 2FA verification
  http.post(`${testConfig.api.baseUrl}/auth/2fa/verify`, async ({ request }) => {
    const body = await request.json() as any;
    const { token, backupCode } = body;

    if (token === '123456' || backupCode === '123456') {
      return HttpResponse.json({
        success: true,
        message: 'Two-factor authentication verified',
      });
    }

    return HttpResponse.json(
      {
        success: false,
        error: 'Invalid two-factor code',
      },
      { status: 401 }
    );
  }),

  // Mock password reset request
  http.post(`${testConfig.api.baseUrl}/auth/password/reset-request`, () => {
    return HttpResponse.json({
      success: true,
      message: 'Password reset email sent',
    });
  }),

  // Mock password reset
  http.post(`${testConfig.api.baseUrl}/auth/password/reset`, () => {
    return HttpResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  }),
];