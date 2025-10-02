import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthController } from '@services/auth/src/controllers/auth-controller';
import { AuthService } from '@services/auth/src/services/auth-service';
import { createTestUser, createTestAuthHeaders } from '../../../utils/auth';

// Mock the AuthService
vi.mock('@services/auth/src/services/auth-service');

describe('AuthController', () => {
  let authController: AuthController;
  let mockAuthService: vi.Mocked<AuthService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock auth service
    mockAuthService = {
      authenticateUser: vi.fn(),
      registerUser: vi.fn(),
      setupTwoFactor: vi.fn(),
      verifyTwoFactor: vi.fn(),
    } as any;

    // Mock the AuthService constructor
    (AuthService as any).mockImplementation(() => mockAuthService);

    // Create controller instance
    authController = new AuthController();

    // Setup mock request and reply
    mockRequest = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      cookies: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setCookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
  });

  describe('login', () => {
    it('should successfully authenticate a user with valid credentials', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const mockUser = createTestUser();
      const mockTokens = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600,
      };

      mockRequest.body = credentials;
      mockAuthService.authenticateUser.mockResolvedValue({
        success: true,
        user: mockUser,
        tokens: mockTokens,
        session: { id: 'session-123' },
      });

      // Act
      await authController.login(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockAuthService.authenticateUser).toHaveBeenCalledWith(
        credentials,
        expect.objectContaining({
          ipAddress: '127.0.0.1',
          userAgent: undefined,
          deviceId: undefined,
          deviceName: undefined,
          deviceType: 'desktop', // Default for non-mobile user agent
        })
      );

      expect(mockReply.setCookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false, // Test environment
          sameSite: 'strict',
        })
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockUser,
        tokens: {
          accessToken: 'mock-access-token',
          expiresIn: 3600,
        },
        session: { id: 'session-123' },
      });
    });

    it('should return 401 for invalid credentials', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockRequest.body = credentials;
      mockAuthService.authenticateUser.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
        errorCode: 'INVALID_CREDENTIALS',
      });

      // Act
      await authController.login(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid credentials',
        errorCode: 'INVALID_CREDENTIALS',
        requiresTwoFactor: undefined,
        tempSessionId: undefined,
      });
    });

    it('should handle two-factor authentication requirement', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = credentials;
      mockAuthService.authenticateUser.mockResolvedValue({
        success: false,
        error: 'Two-factor authentication required',
        errorCode: 'TWO_FACTOR_REQUIRED',
        requiresTwoFactor: true,
        tempSessionId: 'temp-session-123',
      });

      // Act
      await authController.login(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication required',
        errorCode: 'TWO_FACTOR_REQUIRED',
        requiresTwoFactor: true,
        tempSessionId: 'temp-session-123',
      });
    });

    it('should handle authentication service errors', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = credentials;
      mockAuthService.authenticateUser.mockRejectedValue(new Error('Database connection failed'));

      // Act
      await authController.login(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      // Arrange
      const registration = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };

      const mockUser = createTestUser({
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName,
      });

      mockRequest.body = registration;
      mockAuthService.registerUser.mockResolvedValue({
        success: true,
        user: mockUser,
        verificationRequired: true,
      });

      // Act
      await authController.register(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockAuthService.registerUser).toHaveBeenCalledWith(
        registration,
        expect.objectContaining({
          ipAddress: '127.0.0.1',
        })
      );

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockUser,
        verificationRequired: true,
      });
    });

    it('should return 400 for duplicate email', async () => {
      // Arrange
      const registration = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Existing',
        lastName: 'User',
      };

      mockRequest.body = registration;
      mockAuthService.registerUser.mockResolvedValue({
        success: false,
        error: 'Email already exists',
        errorCode: 'EMAIL_EXISTS',
      });

      // Act
      await authController.register(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Email already exists',
        errorCode: 'EMAIL_EXISTS',
      });
    });

    it('should handle registration service errors', async () => {
      // Arrange
      const registration = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };

      mockRequest.body = registration;
      mockAuthService.registerUser.mockRejectedValue(new Error('Validation failed'));

      // Act
      await authController.register(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  describe('logout', () => {
    it('should successfully log out a user', async () => {
      // Arrange
      const mockUser = createTestUser();
      (mockRequest as any).user = mockUser;

      // Act
      await authController.logout(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully',
      });
    });

    it('should handle logout errors gracefully', async () => {
      // Arrange
      const mockUser = createTestUser();
      (mockRequest as any).user = mockUser;
      (mockReply.clearCookie as Mock).mockImplementation(() => {
        throw new Error('Cookie error');
      });

      // Act
      await authController.logout(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens with valid refresh token', async () => {
      // Arrange
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      // Act
      await authController.refreshToken(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        tokens: {
          accessToken: 'new-access-token',
          expiresIn: 3600,
        },
      });
    });

    it('should refresh tokens with cookie refresh token', async () => {
      // Arrange
      mockRequest.cookies = { refreshToken: 'cookie-refresh-token' };

      // Act
      await authController.refreshToken(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        tokens: {
          accessToken: 'new-access-token',
          expiresIn: 3600,
        },
      });
    });

    it('should return 401 when no refresh token provided', async () => {
      // Arrange
      mockRequest.body = {};
      mockRequest.cookies = {};

      // Act
      await authController.refreshToken(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Refresh token required',
      });
    });
  });

  describe('setupTwoFactor', () => {
    it('should setup two-factor authentication for authenticated user', async () => {
      // Arrange
      const mockUser = createTestUser();
      (mockRequest as any).user = mockUser;

      mockAuthService.setupTwoFactor.mockResolvedValue({
        success: true,
        secret: 'MOCK2FASECRET123',
        qrCodeUrl: 'data:image/png;base64,mock-qr-code',
        backupCodes: ['123456', '789012', '345678'],
      });

      // Act
      await authController.setupTwoFactor(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockAuthService.setupTwoFactor).toHaveBeenCalledWith(mockUser.id);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        secret: 'MOCK2FASECRET123',
        qrCodeUrl: 'data:image/png;base64,mock-qr-code',
        backupCodes: ['123456', '789012', '345678'],
      });
    });

    it('should handle two-factor setup errors', async () => {
      // Arrange
      const mockUser = createTestUser();
      (mockRequest as any).user = mockUser;

      mockAuthService.setupTwoFactor.mockResolvedValue({
        success: false,
        error: 'Two-factor already enabled',
      });

      // Act
      await authController.setupTwoFactor(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor already enabled',
      });
    });
  });

  describe('verifyTwoFactor', () => {
    it('should verify two-factor authentication with valid token', async () => {
      // Arrange
      mockRequest.body = { token: '123456' };
      mockRequest.headers = { tempSessionId: 'temp-session-123' };

      mockAuthService.verifyTwoFactor.mockResolvedValue(true);

      // Act
      await authController.verifyTwoFactor(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockAuthService.verifyTwoFactor).toHaveBeenCalledWith(
        'user-from-temp-session',
        '123456',
        undefined
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication verified',
      });
    });

    it('should verify two-factor authentication with backup code', async () => {
      // Arrange
      mockRequest.body = { backupCode: '123456' };
      mockRequest.headers = { tempSessionId: 'temp-session-123' };

      mockAuthService.verifyTwoFactor.mockResolvedValue(true);

      // Act
      await authController.verifyTwoFactor(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockAuthService.verifyTwoFactor).toHaveBeenCalledWith(
        'user-from-temp-session',
        undefined,
        '123456'
      );
    });

    it('should return 401 for invalid two-factor code', async () => {
      // Arrange
      mockRequest.body = { token: 'invalid' };
      mockRequest.headers = { tempSessionId: 'temp-session-123' };

      mockAuthService.verifyTwoFactor.mockResolvedValue(false);

      // Act
      await authController.verifyTwoFactor(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid two-factor code',
      });
    });

    it('should return 400 when no temporary session provided', async () => {
      // Arrange
      mockRequest.body = { token: '123456' };
      mockRequest.headers = {};

      // Act
      await authController.verifyTwoFactor(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Temporary session required',
      });
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user profile', async () => {
      // Arrange
      const mockUser = createTestUser();
      (mockRequest as any).user = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        permissions: ['read:profile'],
        creditPermissions: { canApply: true },
        kycStatus: 'verified',
      };

      // Act
      await authController.getCurrentUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          permissions: ['read:profile'],
          creditPermissions: { canApply: true },
          kycStatus: 'verified',
        },
      });
    });

    it('should handle errors when getting current user', async () => {
      // Arrange
      (mockRequest as any).user = null; // Simulate missing user

      // Act
      await authController.getCurrentUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      // Act
      await authController.healthCheck(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'healthy',
        service: 'auth-service',
        timestamp: expect.any(String),
        version: '1.0.0',
      });
    });
  });

  describe('extractDeviceInfo', () => {
    it('should extract device information from request', () => {
      // Arrange
      mockRequest.ip = '192.168.1.100';
      mockRequest.headers = {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        'x-device-id': 'device-123',
        'x-device-name': 'iPhone 12',
      };

      // Access private method through any cast
      const deviceInfo = (authController as any).extractDeviceInfo(mockRequest);

      // Assert
      expect(deviceInfo).toEqual({
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        deviceId: 'device-123',
        deviceName: 'iPhone 12',
        deviceType: 'mobile',
      });
    });
  });

  describe('detectDeviceType', () => {
    it('should detect mobile device', () => {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile Safari';
      const deviceType = (authController as any).detectDeviceType(userAgent);
      expect(deviceType).toBe('mobile');
    });

    it('should detect tablet device', () => {
      const userAgent = 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) Tablet Safari';
      const deviceType = (authController as any).detectDeviceType(userAgent);
      expect(deviceType).toBe('tablet');
    });

    it('should detect API client', () => {
      const userAgent = 'CreditApp/1.0 API Client';
      const deviceType = (authController as any).detectDeviceType(userAgent);
      expect(deviceType).toBe('api');
    });

    it('should default to desktop', () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
      const deviceType = (authController as any).detectDeviceType(userAgent);
      expect(deviceType).toBe('desktop');
    });
  });
});