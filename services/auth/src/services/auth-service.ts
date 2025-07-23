import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import validator from 'validator';
import pino from 'pino';

import type {
  LoginRequest,
  RegistrationRequest,
  AuthenticationResult,
  RegistrationResult,
  TwoFactorSetupResult,
  SessionData,
  DeviceInfo,
  SecurityEvent,
  RiskAssessment,
  JWTPayload
} from '../types/auth.js';

import { SMEAPIClient } from '@caas/sme-integration';
import { validateEnv } from '@caas/config';

const logger = pino({ name: 'auth-service' });
const env = validateEnv();

export class AuthService {
  private smeClient: SMEAPIClient;
  private readonly JWT_SECRET: string;
  private readonly REFRESH_SECRET: string;
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly REFRESH_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor() {
    this.smeClient = new SMEAPIClient();
    this.JWT_SECRET = env.JWT_SECRET;
    this.REFRESH_SECRET = env.REFRESH_SECRET || env.JWT_SECRET + '_refresh';
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(
    credentials: LoginRequest,
    deviceInfo?: DeviceInfo
  ): Promise<AuthenticationResult> {
    try {
      // Input validation
      if (!validator.isEmail(credentials.email)) {
        return { 
          success: false, 
          error: 'Invalid email format',
          errorCode: 'INVALID_EMAIL'
        };
      }

      // Try to get user from SME platform first
      let smeUser;
      try {
        smeUser = await this.smeClient.getUserByEmail(credentials.email);
      } catch (error) {
        logger.warn({ email: credentials.email }, 'User not found in SME platform');
        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: 'INVALID_CREDENTIALS'
        };
      }

      // For this initial implementation, we'll validate against SME platform
      // In production, you'd have local password storage for CaaS-specific users
      const isValidCredentials = await this.validateSMECredentials(
        credentials.email, 
        credentials.password
      );

      if (!isValidCredentials) {
        await this.logSecurityEvent({
          type: 'login_failed',
          userId: smeUser.id,
          ipAddress: deviceInfo?.ipAddress,
          userAgent: deviceInfo?.userAgent,
          metadata: { reason: 'invalid_password' },
          timestamp: new Date()
        });

        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: 'INVALID_CREDENTIALS'
        };
      }

      // Check if user requires two-factor authentication
      // This would be stored in your local database
      const requires2FA = await this.userRequires2FA(smeUser.id);
      if (requires2FA) {
        // Create temporary session for 2FA
        const tempSessionId = await this.createTempSession(smeUser.id);
        return {
          success: false,
          requiresTwoFactor: true,
          tempSessionId,
          error: 'Two-factor authentication required',
          errorCode: 'REQUIRES_2FA'
        };
      }

      // Risk assessment
      const riskAssessment = await this.assessLoginRisk(smeUser.id, deviceInfo);
      if (riskAssessment.recommendation === 'block') {
        return {
          success: false,
          error: 'Login blocked due to security concerns',
          errorCode: 'SECURITY_BLOCK'
        };
      }

      // Create session
      const session = await this.createSession(smeUser.id, deviceInfo);
      
      // Generate tokens
      const tokens = await this.generateTokens(smeUser, session);

      // Log successful login
      await this.logSecurityEvent({
        type: 'login',
        userId: smeUser.id,
        sessionId: session.id,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        riskScore: riskAssessment.score,
        timestamp: new Date()
      });

      return {
        success: true,
        user: {
          id: smeUser.id,
          email: smeUser.email,
          firstName: smeUser.firstName,
          lastName: smeUser.lastName,
          role: this.mapSMERole(smeUser.permissions),
          status: this.mapSMEStatus(smeUser.kycStatus),
          kycStatus: smeUser.kycStatus,
          lastLoginAt: smeUser.lastLoginAt ? new Date(smeUser.lastLoginAt) : null
        },
        tokens,
        session: {
          id: session.id,
          deviceName: session.deviceName,
          expiresAt: session.expiresAt
        }
      };

    } catch (error) {
      logger.error({ error, email: credentials.email }, 'Authentication error');
      return {
        success: false,
        error: 'Authentication failed',
        errorCode: 'AUTH_ERROR'
      };
    }
  }

  /**
   * Register new user (would integrate with existing SME registration)
   */
  async registerUser(
    registration: RegistrationRequest,
    deviceInfo?: DeviceInfo
  ): Promise<RegistrationResult> {
    try {
      // In a real implementation, this would create a user in the SME platform
      // For now, we'll simulate the registration process
      
      // Check if user already exists
      try {
        await this.smeClient.getUserByEmail(registration.email);
        return {
          success: false,
          error: 'User already exists',
          errorCode: 'USER_EXISTS'
        };
      } catch (error) {
        // User doesn't exist, continue with registration
      }

      // Validate password strength
      if (!this.isPasswordStrong(registration.password)) {
        return {
          success: false,
          error: 'Password does not meet security requirements',
          errorCode: 'WEAK_PASSWORD'
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(registration.password, 12);

      // In real implementation, create user in SME platform
      // const newUser = await this.smeClient.createUser({...registration, passwordHash});

      // For simulation, create a mock user object
      const newUser = {
        id: uuidv4(),
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName
      };

      // Log registration event
      await this.logSecurityEvent({
        type: 'login', // Would be 'registration' in real implementation
        userId: newUser.id,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        timestamp: new Date()
      });

      return {
        success: true,
        user: newUser,
        verificationRequired: true
      };

    } catch (error) {
      logger.error({ error, email: registration.email }, 'Registration error');
      return {
        success: false,
        error: 'Registration failed',
        errorCode: 'REGISTRATION_ERROR'
      };
    }
  }

  /**
   * Setup two-factor authentication for user
   */
  async setupTwoFactor(userId: string): Promise<TwoFactorSetupResult> {
    try {
      // Get user from SME platform
      const user = await this.smeClient.getUser(userId);
      
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `CaaS Platform (${user.email})`,
        issuer: 'Credit-as-a-Service',
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes
      const backupCodes = Array.from({ length: 10 }, () => 
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );

      // In real implementation, store secret and backup codes in database
      // await this.storeTwoFactorSecret(userId, secret.base32, backupCodes);

      return {
        success: true,
        secret: secret.base32,
        qrCodeUrl,
        backupCodes
      };

    } catch (error) {
      logger.error({ error, userId }, 'Two-factor setup error');
      return {
        success: false,
        error: 'Two-factor setup failed'
      };
    }
  }

  /**
   * Verify two-factor authentication token
   */
  async verifyTwoFactor(
    userId: string, 
    token: string, 
    backupCode?: string
  ): Promise<boolean> {
    try {
      // In real implementation, get stored secret from database
      const storedSecret = await this.getTwoFactorSecret(userId);
      
      if (backupCode) {
        return await this.verifyBackupCode(userId, backupCode);
      }

      const verified = speakeasy.totp.verify({
        secret: storedSecret,
        encoding: 'base32',
        token,
        window: 2 // Allow 2 windows of tolerance
      });

      return verified;

    } catch (error) {
      logger.error({ error, userId }, 'Two-factor verification error');
      return false;
    }
  }

  /**
   * Generate JWT and refresh tokens
   */
  private async generateTokens(
    user: any, 
    session: SessionData
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour

    // Get user permissions from SME platform and map to credit permissions
    const creditPermissions = this.mapToCreditPermissions(user.permissions || []);

    const jwtPayload: JWTPayload = {
      sub: user.id,
      email: user.email,
      tenantId: session.tenantId,
      role: this.mapSMERole(user.permissions),
      permissions: user.permissions || [],
      sessionId: session.id,
      exp: now + expiresIn,
      iat: now,
      iss: 'caas-auth-service',
      aud: 'caas-platform',
      creditPermissions,
      creditLimit: await this.getUserCreditLimit(user.id),
      riskRating: await this.getUserRiskRating(user.id),
      kycStatus: user.kycStatus
    };

    // In real implementation, use proper JWT library
    const accessToken = this.signJWT(jwtPayload);
    const refreshToken = this.signRefreshToken({
      sub: user.id,
      sessionId: session.id,
      tokenFamily: uuidv4(),
      exp: now + (this.REFRESH_DURATION / 1000),
      iat: now
    });

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * Create user session
   */
  private async createSession(
    userId: string, 
    deviceInfo?: DeviceInfo
  ): Promise<SessionData> {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION);

    const session: SessionData = {
      id: sessionId,
      userId,
      tenantId: await this.getUserTenantId(userId),
      deviceId: deviceInfo?.deviceId,
      deviceName: deviceInfo?.deviceName,
      deviceType: deviceInfo?.deviceType,
      ipAddress: deviceInfo?.ipAddress,
      userAgent: deviceInfo?.userAgent,
      location: deviceInfo?.location,
      isActive: true,
      expiresAt,
      lastUsedAt: now,
      createdAt: now
    };

    // In real implementation, store session in database
    // await this.storeSession(session);

    return session;
  }

  // Helper methods (would be implemented with actual database operations)
  private async validateSMECredentials(email: string, password: string): Promise<boolean> {
    // In real implementation, validate against SME auth service
    // For now, simulate validation
    return true;
  }

  private async userRequires2FA(userId: string): Promise<boolean> {
    // Check if user has 2FA enabled
    return false; // Simulate - would check database
  }

  private async createTempSession(userId: string): Promise<string> {
    return uuidv4(); // Simulate temp session
  }

  private async assessLoginRisk(userId: string, deviceInfo?: DeviceInfo): Promise<RiskAssessment> {
    // Implement risk assessment logic
    return {
      score: 0.1,
      factors: [],
      recommendation: 'allow'
    };
  }

  private async logSecurityEvent(event: SecurityEvent): Promise<void> {
    // Log security event to audit trail
    logger.info(event, 'Security event logged');
  }

  private mapSMERole(permissions: string[] = []): string {
    // Map SME permissions to CaaS roles
    if (permissions.includes('admin')) return 'admin';
    if (permissions.includes('finance_manager')) return 'finance_manager';
    return 'customer';
  }

  private mapSMEStatus(kycStatus: string): string {
    // Map SME KYC status to user status
    switch (kycStatus) {
      case 'verified': return 'active';
      case 'pending': return 'pending_verification';
      case 'rejected': return 'suspended';
      default: return 'inactive';
    }
  }

  private mapToCreditPermissions(smePermissions: string[]): string[] {
    // Map SME permissions to credit-specific permissions
    const creditPerms: string[] = [];
    
    if (smePermissions.includes('admin')) {
      creditPerms.push('credit:admin:all');
    }
    if (smePermissions.includes('finance_manager')) {
      creditPerms.push('credit:application:approve', 'credit:disbursement:execute');
    }
    if (smePermissions.includes('business_owner')) {
      creditPerms.push('credit:application:create', 'credit:application:view');
    }
    
    return creditPerms;
  }

  private isPasswordStrong(password: string): boolean {
    return password.length >= 8 &&
           /[a-z]/.test(password) &&
           /[A-Z]/.test(password) &&
           /\d/.test(password) &&
           /[@$!%*?&]/.test(password);
  }

  private signJWT(payload: JWTPayload): string {
    // In real implementation, use proper JWT library
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private signRefreshToken(payload: any): string {
    // In real implementation, use proper JWT library
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private async getUserTenantId(userId: string): Promise<string> {
    // Get user's tenant ID
    return 'default-tenant'; // Simulate
  }

  private async getUserCreditLimit(userId: string): Promise<number | undefined> {
    // Get user's credit limit if available
    return undefined;
  }

  private async getUserRiskRating(userId: string): Promise<'low' | 'medium' | 'high' | undefined> {
    // Get user's risk rating
    return 'low';
  }

  private async getTwoFactorSecret(userId: string): Promise<string> {
    // Get stored 2FA secret
    return 'mock-secret';
  }

  private async verifyBackupCode(userId: string, backupCode: string): Promise<boolean> {
    // Verify backup code
    return false;
  }
}