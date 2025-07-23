import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { AuthService } from '@services/auth/src/services/auth-service';
import { getTestDb } from '../../../utils/database';
import { hashTestPassword, compareTestPassword } from '../../../utils/auth';
import { userFixtures } from '../../../fixtures/users';

// Mock external dependencies
vi.mock('../../../utils/database');
vi.mock('../../../utils/auth');
vi.mock('jsonwebtoken');
vi.mock('crypto');

describe('AuthService', () => {
  let authService: AuthService;
  let mockDb: any;

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
    };

    (getTestDb as Mock).mockReturnValue(mockDb);
    
    authService = new AuthService();
  });

  describe('authenticateUser', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      const mockUser = {
        ...userFixtures.user1,
        passwordHash: 'hashed-password',
      };

      // Mock database query to find user
      mockDb.where.mockResolvedValue([mockUser]);
      
      // Mock password comparison
      (compareTestPassword as Mock).mockResolvedValue(true);

      // Act
      const result = await authService.authenticateUser(credentials, deviceInfo);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalledWith(expect.any(Function));
      expect(compareTestPassword).toHaveBeenCalledWith('password123', 'hashed-password');
      expect(result.success).toBe(true);
      expect(result.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
      });
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should fail authentication with invalid email', async () => {
      // Arrange
      const credentials = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      // Mock database query to return no user
      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await authService.authenticateUser(credentials, deviceInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should fail authentication with invalid password', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      const mockUser = {
        ...userFixtures.user1,
        passwordHash: 'hashed-password',
      };

      // Mock database query to find user
      mockDb.where.mockResolvedValue([mockUser]);
      
      // Mock password comparison to fail
      (compareTestPassword as Mock).mockResolvedValue(false);

      // Act
      const result = await authService.authenticateUser(credentials, deviceInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('should require two-factor authentication when enabled', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      const mockUser = {
        ...userFixtures.user2, // user2 has 2FA enabled
        passwordHash: 'hashed-password',
        twoFactorEnabled: true,
      };

      // Mock database query to find user
      mockDb.where.mockResolvedValue([mockUser]);
      
      // Mock password comparison
      (compareTestPassword as Mock).mockResolvedValue(true);

      // Act
      const result = await authService.authenticateUser(credentials, deviceInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Two-factor authentication required');
      expect(result.errorCode).toBe('TWO_FACTOR_REQUIRED');
      expect(result.requiresTwoFactor).toBe(true);
      expect(result.tempSessionId).toBeDefined();
    });

    it('should reject suspended user', async () => {
      // Arrange
      const credentials = {
        email: 'suspended@example.com',
        password: 'password123',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      const mockUser = {
        ...userFixtures.suspendedUser,
        passwordHash: 'hashed-password',
      };

      // Mock database query to find user
      mockDb.where.mockResolvedValue([mockUser]);
      
      // Mock password comparison
      (compareTestPassword as Mock).mockResolvedValue(true);

      // Act
      const result = await authService.authenticateUser(credentials, deviceInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is suspended');
      expect(result.errorCode).toBe('ACCOUNT_SUSPENDED');
    });

    it('should handle database errors', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      // Mock database error
      mockDb.where.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(authService.authenticateUser(credentials, deviceInfo))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      // Arrange
      const registration = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([]); // No existing user
      
      const mockNewUser = {
        id: 'new-user-123',
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        role: 'user',
        status: 'pending_verification',
        kycStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockNewUser]);
      
      // Mock password hashing
      (hashTestPassword as Mock).mockResolvedValue('hashed-password');

      // Act
      const result = await authService.registerUser(registration, deviceInfo);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registration.email,
          firstName: registration.firstName,
          lastName: registration.lastName,
          passwordHash: 'hashed-password',
          role: 'user',
          status: 'pending_verification',
        })
      );
      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockNewUser);
      expect(result.verificationRequired).toBe(true);
    });

    it('should reject registration with existing email', async () => {
      // Arrange
      const registration = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Existing',
        lastName: 'User',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      // Mock database query to find existing user
      mockDb.where.mockResolvedValue([userFixtures.user1]);

      // Act
      const result = await authService.registerUser(registration, deviceInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
      expect(result.errorCode).toBe('EMAIL_EXISTS');
    });

    it('should validate password strength', async () => {
      // Arrange
      const registration = {
        email: 'newuser@example.com',
        password: 'weak',
        firstName: 'New',
        lastName: 'User',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      // Mock database query to find no existing user
      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await authService.registerUser(registration, deviceInfo);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Password does not meet requirements');
      expect(result.errorCode).toBe('WEAK_PASSWORD');
    });

    it('should handle database errors during registration', async () => {
      // Arrange
      const registration = {
        email: 'newuser@example.com',
        password: 'StrongPassword123!',
        firstName: 'New',
        lastName: 'User',
      };

      const deviceInfo = {
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        deviceId: 'device-123',
        deviceName: 'Chrome Browser',
        deviceType: 'desktop' as const,
      };

      // Mock database error
      mockDb.where.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(authService.registerUser(registration, deviceInfo))
        .rejects.toThrow('Database error');
    });
  });

  describe('setupTwoFactor', () => {
    it('should setup two-factor authentication for user', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUser = {
        ...userFixtures.user1,
        twoFactorEnabled: false,
      };

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([mockUser]); // Find user
      mockDb.set.mockResolvedValue([{ ...mockUser, twoFactorSecret: 'MOCK2FASECRET' }]);

      // Act
      const result = await authService.setupTwoFactor(userId);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.secret).toBeDefined();
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.backupCodes).toHaveLength(10);
    });

    it('should reject setup for user with 2FA already enabled', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUser = {
        ...userFixtures.user2,
        twoFactorEnabled: true,
      };

      // Mock database query
      mockDb.where.mockResolvedValue([mockUser]);

      // Act
      const result = await authService.setupTwoFactor(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Two-factor authentication is already enabled');
    });

    it('should reject setup for non-existent user', async () => {
      // Arrange
      const userId = 'non-existent-user';

      // Mock database query to return no user
      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await authService.setupTwoFactor(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('verifyTwoFactor', () => {
    it('should verify valid TOTP token', async () => {
      // Arrange
      const userId = 'user-123';
      const token = '123456';
      const mockUser = {
        ...userFixtures.user2,
        twoFactorSecret: 'MOCK2FASECRET',
        twoFactorEnabled: true,
      };

      // Mock database query
      mockDb.where.mockResolvedValue([mockUser]);

      // Mock TOTP verification (would use speakeasy in real implementation)
      vi.doMock('speakeasy', () => ({
        totp: {
          verify: vi.fn().mockReturnValue(true),
        },
      }));

      // Act
      const result = await authService.verifyTwoFactor(userId, token);

      // Assert
      expect(result).toBe(true);
    });

    it('should verify valid backup code', async () => {
      // Arrange
      const userId = 'user-123';
      const backupCode = 'backup123';
      const mockUser = {
        ...userFixtures.user2,
        twoFactorSecret: 'MOCK2FASECRET',
        twoFactorEnabled: true,
        backupCodes: ['backup123', 'backup456'],
      };

      // Mock database queries
      mockDb.where.mockResolvedValue([mockUser]);
      mockDb.set.mockResolvedValue([{ ...mockUser, backupCodes: ['backup456'] }]);

      // Act
      const result = await authService.verifyTwoFactor(userId, undefined, backupCode);

      // Assert
      expect(result).toBe(true);
      expect(mockDb.update).toHaveBeenCalled(); // Backup code should be removed
    });

    it('should reject invalid token', async () => {
      // Arrange
      const userId = 'user-123';
      const token = 'invalid';
      const mockUser = {
        ...userFixtures.user2,
        twoFactorSecret: 'MOCK2FASECRET',
        twoFactorEnabled: true,
      };

      // Mock database query
      mockDb.where.mockResolvedValue([mockUser]);

      // Mock TOTP verification to fail
      vi.doMock('speakeasy', () => ({
        totp: {
          verify: vi.fn().mockReturnValue(false),
        },
      }));

      // Act
      const result = await authService.verifyTwoFactor(userId, token);

      // Assert
      expect(result).toBe(false);
    });

    it('should reject verification for user without 2FA', async () => {
      // Arrange
      const userId = 'user-123';
      const token = '123456';
      const mockUser = {
        ...userFixtures.user1,
        twoFactorEnabled: false,
      };

      // Mock database query
      mockDb.where.mockResolvedValue([mockUser]);

      // Act
      const result = await authService.verifyTwoFactor(userId, token);

      // Assert
      expect(result).toBe(false);
    });

    it('should reject verification for non-existent user', async () => {
      // Arrange
      const userId = 'non-existent-user';
      const token = '123456';

      // Mock database query to return no user
      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await authService.verifyTwoFactor(userId, token);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('private methods', () => {
    describe('validatePasswordStrength', () => {
      it('should accept strong password', () => {
        const isValid = (authService as any).validatePasswordStrength('StrongPassword123!');
        expect(isValid).toBe(true);
      });

      it('should reject short password', () => {
        const isValid = (authService as any).validatePasswordStrength('Short1!');
        expect(isValid).toBe(false);
      });

      it('should reject password without uppercase', () => {
        const isValid = (authService as any).validatePasswordStrength('lowercase123!');
        expect(isValid).toBe(false);
      });

      it('should reject password without lowercase', () => {
        const isValid = (authService as any).validatePasswordStrength('UPPERCASE123!');
        expect(isValid).toBe(false);
      });

      it('should reject password without numbers', () => {
        const isValid = (authService as any).validatePasswordStrength('NoNumbers!');
        expect(isValid).toBe(false);
      });

      it('should reject password without special characters', () => {
        const isValid = (authService as any).validatePasswordStrength('NoSpecialChars123');
        expect(isValid).toBe(false);
      });
    });

    describe('generateBackupCodes', () => {
      it('should generate 10 unique backup codes', () => {
        const codes = (authService as any).generateBackupCodes();
        expect(codes).toHaveLength(10);
        expect(new Set(codes)).toHaveProperty('size', 10); // All codes should be unique
        codes.forEach((code: string) => {
          expect(code).toMatch(/^[A-Z0-9]{8}$/); // 8 character alphanumeric codes
        });
      });
    });
  });
});