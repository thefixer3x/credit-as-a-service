import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { createTestApiClient, expectSuccessResponse, expectErrorResponse } from '../utils/api';
import { createTestUser, createTestAuthHeaders, hashTestPassword } from '../utils/auth';
import { createTestTenant, createTestUser as createDbUser, resetDatabase } from '../utils/database';
import { userFixtures, initializeUserFixtures } from '../fixtures/users';

describe('Authentication API Integration Tests', () => {
  let apiClient: ReturnType<typeof createTestApiClient>;
  let testTenant: any;

  beforeAll(async () => {
    // Initialize test fixtures
    await initializeUserFixtures();
  });

  beforeEach(async () => {
    // Reset database state
    await resetDatabase();
    
    // Create test tenant
    testTenant = await createTestTenant();
    
    // Initialize API client (assuming we have a test API server running)
    apiClient = createTestApiClient('http://localhost:8001');
  });

  afterEach(async () => {
    // Cleanup after each test
    await resetDatabase();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      // Arrange
      const registrationData = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        firstName: 'New',
        lastName: 'User',
        tenantId: testTenant.id,
      };

      // Act
      const response = await apiClient.register(registrationData);

      // Assert
      expect(response.status).toBe(201);
      expectSuccessResponse(response);
      expect(response.body.user).toMatchObject({
        email: registrationData.email,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        role: 'user',
        status: 'pending_verification',
      });
      expect(response.body.verificationRequired).toBe(true);
      expect(response.body.user.id).toBeDefined();
    });

    it('should reject registration with existing email', async () => {
      // Arrange
      const existingUser = await createDbUser(testTenant.id, {
        email: 'existing@example.com',
        passwordHash: await hashTestPassword('password123'),
      });

      const registrationData = {
        email: 'existing@example.com',
        password: 'AnotherSecurePassword123!',
        firstName: 'Another',
        lastName: 'User',
        tenantId: testTenant.id,
      };

      // Act
      const response = await apiClient.register(registrationData);

      // Assert
      expect(response.status).toBe(409);
      expectErrorResponse(response, 409);
      expect(response.body.error).toBe('Email already exists');
      expect(response.body.errorCode).toBe('EMAIL_EXISTS');
    });

    it('should reject registration with weak password', async () => {
      // Arrange
      const registrationData = {
        email: 'newuser@example.com',
        password: 'weak',
        firstName: 'New',
        lastName: 'User',
        tenantId: testTenant.id,
      };

      // Act
      const response = await apiClient.register(registrationData);

      // Assert
      expect(response.status).toBe(400);
      expectErrorResponse(response, 400);
      expect(response.body.error).toContain('password');
    });

    it('should reject registration with missing required fields', async () => {
      // Arrange
      const incompleteData = {
        email: 'incomplete@example.com',
        // Missing password, firstName, lastName
      };

      // Act
      const response = await apiClient.post('/auth/register', incompleteData);

      // Assert
      expect(response.status).toBe(400);
      expectErrorResponse(response, 400);
    });

    it('should reject registration with invalid email format', async () => {
      // Arrange
      const registrationData = {
        email: 'invalid-email-format',
        password: 'SecurePassword123!',
        firstName: 'Test',
        lastName: 'User',
        tenantId: testTenant.id,
      };

      // Act
      const response = await apiClient.register(registrationData);

      // Assert
      expect(response.status).toBe(400);
      expectErrorResponse(response, 400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      // Arrange
      const password = 'TestPassword123!';
      const user = await createDbUser(testTenant.id, {
        email: 'testuser@example.com',
        passwordHash: await hashTestPassword(password),
        status: 'active',
        kycStatus: 'verified',
      });

      const credentials = {
        email: user.email,
        password,
      };

      // Act
      const response = await apiClient.login(credentials);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.user).toMatchObject({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      });
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('expiresIn');
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(typeof response.body.tokens.expiresIn).toBe('number');
    });

    it('should reject login with invalid email', async () => {
      // Arrange
      const credentials = {
        email: 'nonexistent@example.com',
        password: 'TestPassword123!',
      };

      // Act
      const response = await apiClient.login(credentials);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with invalid password', async () => {
      // Arrange
      const user = await createDbUser(testTenant.id, {
        email: 'testuser@example.com',
        passwordHash: await hashTestPassword('CorrectPassword123!'),
        status: 'active',
      });

      const credentials = {
        email: user.email,
        password: 'WrongPassword123!',
      };

      // Act
      const response = await apiClient.login(credentials);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login for suspended user', async () => {
      // Arrange
      const password = 'TestPassword123!';
      const user = await createDbUser(testTenant.id, {
        email: 'suspended@example.com',
        passwordHash: await hashTestPassword(password),
        status: 'suspended',
      });

      const credentials = {
        email: user.email,
        password,
      };

      // Act
      const response = await apiClient.login(credentials);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Account is suspended');
      expect(response.body.errorCode).toBe('ACCOUNT_SUSPENDED');
    });

    it('should require 2FA for users with 2FA enabled', async () => {
      // Arrange
      const password = 'TestPassword123!';
      const user = await createDbUser(testTenant.id, {
        email: 'twofa@example.com',
        passwordHash: await hashTestPassword(password),
        status: 'active',
        twoFactorEnabled: true,
        twoFactorSecret: 'MOCK2FASECRET123',
      });

      const credentials = {
        email: user.email,
        password,
      };

      // Act
      const response = await apiClient.login(credentials);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Two-factor authentication required');
      expect(response.body.errorCode).toBe('TWO_FACTOR_REQUIRED');
      expect(response.body.requiresTwoFactor).toBe(true);
      expect(response.body.tempSessionId).toBeDefined();
    });

    it('should set refresh token cookie on successful login', async () => {
      // Arrange
      const password = 'TestPassword123!';
      const user = await createDbUser(testTenant.id, {
        email: 'testuser@example.com',
        passwordHash: await hashTestPassword(password),
        status: 'active',
      });

      const credentials = {
        email: user.email,
        password,
      };

      // Act
      const response = await apiClient.login(credentials);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();
      
      const setCookieHeader = response.headers['set-cookie'];
      const refreshTokenCookie = Array.isArray(setCookieHeader) 
        ? setCookieHeader.find(cookie => cookie.includes('refreshToken'))
        : setCookieHeader;
      
      expect(refreshTokenCookie).toContain('refreshToken=');
      expect(refreshTokenCookie).toContain('HttpOnly');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout authenticated user', async () => {
      // Arrange
      const user = createTestUser();
      const authHeaders = createTestAuthHeaders(user);

      // Act
      const response = await apiClient.logout(authHeaders);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should require authentication for logout', async () => {
      // Act
      const response = await apiClient.post('/auth/logout');

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
    });

    it('should clear refresh token cookie on logout', async () => {
      // Arrange
      const user = createTestUser();
      const authHeaders = createTestAuthHeaders(user);

      // Act
      const response = await apiClient.logout(authHeaders);

      // Assert
      expect(response.status).toBe(200);
      
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        const clearCookieHeader = Array.isArray(setCookieHeader) 
          ? setCookieHeader.find(cookie => cookie.includes('refreshToken'))
          : setCookieHeader;
        
        expect(clearCookieHeader).toContain('refreshToken=');
        expect(clearCookieHeader).toContain('Max-Age=0');
      }
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      // Arrange
      const refreshToken = 'valid-refresh-token';

      // Act
      const response = await apiClient.refreshToken(refreshToken);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('expiresIn');
      expect(response.body.tokens.accessToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      // Arrange
      const invalidRefreshToken = 'invalid-refresh-token';

      // Act
      const response = await apiClient.refreshToken(invalidRefreshToken);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Invalid refresh token');
    });

    it('should reject request without refresh token', async () => {
      // Act
      const response = await apiClient.post('/auth/refresh', {});

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Refresh token required');
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user profile', async () => {
      // Arrange
      const user = createTestUser();
      const authHeaders = createTestAuthHeaders(user);

      // Act
      const response = await apiClient.getCurrentUser(authHeaders);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.user).toMatchObject({
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        creditPermissions: user.creditPermissions,
      });
    });

    it('should require authentication', async () => {
      // Act
      const response = await apiClient.get('/auth/me');

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
    });

    it('should reject invalid token', async () => {
      // Arrange
      const invalidHeaders = {
        'Authorization': 'Bearer invalid-token',
        'Content-Type': 'application/json',
      };

      // Act
      const response = await apiClient.get('/auth/me', invalidHeaders);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
    });
  });

  describe('POST /auth/2fa/setup', () => {
    it('should setup 2FA for authenticated user', async () => {
      // Arrange
      const user = createTestUser();
      const authHeaders = createTestAuthHeaders(user);

      // Act
      const response = await apiClient.post('/auth/2fa/setup', {}, authHeaders);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.secret).toBeDefined();
      expect(response.body.qrCodeUrl).toBeDefined();
      expect(response.body.backupCodes).toBeInstanceOf(Array);
      expect(response.body.backupCodes).toHaveLength(10);
    });

    it('should require authentication for 2FA setup', async () => {
      // Act
      const response = await apiClient.post('/auth/2fa/setup');

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
    });
  });

  describe('POST /auth/2fa/verify', () => {
    it('should verify valid 2FA token', async () => {
      // Arrange
      const verificationData = {
        token: '123456',
      };
      
      const headers = {
        'tempSessionId': 'temp-session-123',
        'Content-Type': 'application/json',
      };

      // Act
      const response = await apiClient.post('/auth/2fa/verify', verificationData, headers);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.message).toBe('Two-factor authentication verified');
    });

    it('should verify valid backup code', async () => {
      // Arrange
      const verificationData = {
        backupCode: '123456',
      };
      
      const headers = {
        'tempSessionId': 'temp-session-123',
        'Content-Type': 'application/json',
      };

      // Act
      const response = await apiClient.post('/auth/2fa/verify', verificationData, headers);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });

    it('should reject invalid 2FA token', async () => {
      // Arrange
      const verificationData = {
        token: 'invalid',
      };
      
      const headers = {
        'tempSessionId': 'temp-session-123',
        'Content-Type': 'application/json',
      };

      // Act
      const response = await apiClient.post('/auth/2fa/verify', verificationData, headers);

      // Assert
      expect(response.status).toBe(401);
      expectErrorResponse(response, 401);
      expect(response.body.error).toBe('Invalid two-factor code');
    });

    it('should require temporary session ID', async () => {
      // Arrange
      const verificationData = {
        token: '123456',
      };

      // Act
      const response = await apiClient.post('/auth/2fa/verify', verificationData);

      // Assert
      expect(response.status).toBe(400);
      expectErrorResponse(response, 400);
      expect(response.body.error).toBe('Temporary session required');
    });
  });

  describe('POST /auth/password/reset-request', () => {
    it('should send password reset email', async () => {
      // Arrange
      const resetData = {
        email: 'user@example.com',
      };

      // Act
      const response = await apiClient.post('/auth/password/reset-request', resetData);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.message).toBe('Password reset email sent');
    });

    it('should handle non-existent email gracefully', async () => {
      // Arrange
      const resetData = {
        email: 'nonexistent@example.com',
      };

      // Act
      const response = await apiClient.post('/auth/password/reset-request', resetData);

      // Assert
      // Should still return success for security reasons
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
    });
  });

  describe('POST /auth/password/reset', () => {
    it('should reset password with valid token', async () => {
      // Arrange
      const resetData = {
        token: 'valid-reset-token',
        newPassword: 'NewSecurePassword123!',
      };

      // Act
      const response = await apiClient.post('/auth/password/reset', resetData);

      // Assert
      expect(response.status).toBe(200);
      expectSuccessResponse(response);
      expect(response.body.message).toBe('Password reset successfully');
    });

    it('should reject invalid reset token', async () => {
      // Arrange
      const resetData = {
        token: 'invalid-token',
        newPassword: 'NewSecurePassword123!',
      };

      // Act
      const response = await apiClient.post('/auth/password/reset', resetData);

      // Assert
      expect(response.status).toBe(400);
      expectErrorResponse(response, 400);
    });
  });

  describe('GET /auth/health', () => {
    it('should return health status', async () => {
      // Act
      const response = await apiClient.healthCheck();

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'auth-service',
        timestamp: expect.any(String),
        version: expect.any(String),
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive login attempts', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      // Act - Make multiple failed login attempts
      const responses = await Promise.all(
        Array(6).fill(0).map(() => apiClient.login(credentials))
      );

      // Assert - Last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429); // Too Many Requests
    });

    it('should rate limit excessive registration attempts', async () => {
      // Arrange
      const registrationData = [
        { email: 'user1@example.com', password: 'Password123!', firstName: 'User', lastName: 'One' },
        { email: 'user2@example.com', password: 'Password123!', firstName: 'User', lastName: 'Two' },
        { email: 'user3@example.com', password: 'Password123!', firstName: 'User', lastName: 'Three' },
        { email: 'user4@example.com', password: 'Password123!', firstName: 'User', lastName: 'Four' },
        { email: 'user5@example.com', password: 'Password123!', firstName: 'User', lastName: 'Five' },
        { email: 'user6@example.com', password: 'Password123!', firstName: 'User', lastName: 'Six' },
      ];

      // Act - Make multiple registration attempts
      const responses = await Promise.all(
        registrationData.map(data => apiClient.register(data))
      );

      // Assert - Last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
    });
  });
});