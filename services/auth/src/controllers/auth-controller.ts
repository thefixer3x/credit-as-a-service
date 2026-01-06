/// <reference path="../types/fastify.d.ts" />
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pino from 'pino';

import { AuthService } from '../services/auth-service.js';
import {
  loginSchema,
  registrationSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  twoFactorSetupSchema,
  twoFactorVerifySchema,
  refreshTokenSchema
} from '../types/auth.js';

const logger = pino({ name: 'auth-controller' });

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Register routes with Fastify instance
   */
  async registerRoutes(fastify: FastifyInstance) {
    // Authentication routes
    fastify.post('/auth/login', {
      schema: {
        body: loginSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  role: { type: 'string' },
                  status: { type: 'string' }
                }
              },
              tokens: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                  expiresIn: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }, this.login.bind(this));

    fastify.post('/auth/register', {
      schema: {
        body: registrationSchema,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }, this.register.bind(this));

    fastify.post('/auth/logout', {
      preHandler: [fastify.authenticate]
    }, this.logout.bind(this));

    fastify.post('/auth/refresh', {
      schema: {
        body: refreshTokenSchema
      }
    }, this.refreshToken.bind(this));

    // Password management routes
    fastify.post('/auth/password/reset-request', {
      schema: {
        body: passwordResetRequestSchema
      }
    }, this.requestPasswordReset.bind(this));

    fastify.post('/auth/password/reset', {
      schema: {
        body: passwordResetSchema
      }
    }, this.resetPassword.bind(this));

    fastify.post('/auth/password/change', {
      preHandler: [fastify.authenticate]
    }, this.changePassword.bind(this));

    // Two-factor authentication routes
    fastify.post('/auth/2fa/setup', {
      preHandler: [fastify.authenticate]
    }, this.setupTwoFactor.bind(this));

    fastify.post('/auth/2fa/verify', {
      schema: {
        body: twoFactorVerifySchema
      }
    }, this.verifyTwoFactor.bind(this));

    fastify.post('/auth/2fa/disable', {
      preHandler: [fastify.authenticate]
    }, this.disableTwoFactor.bind(this));

    // Session management routes
    fastify.get('/auth/sessions', {
      preHandler: [fastify.authenticate]
    }, this.getSessions.bind(this));

    fastify.delete('/auth/sessions/:sessionId', {
      preHandler: [fastify.authenticate]
    }, this.revokeSession.bind(this));

    // User profile routes
    fastify.get('/auth/me', {
      preHandler: [fastify.authenticate]
    }, this.getCurrentUser.bind(this));

    fastify.put('/auth/me', {
      preHandler: [fastify.authenticate]
    }, this.updateProfile.bind(this));

    // Health check
    fastify.get('/auth/health', this.healthCheck.bind(this));
  }

  /**
   * Login endpoint
   */
  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const credentials = request.body as any;
      const deviceInfo = this.extractDeviceInfo(request);

      const result = await this.authService.authenticateUser(credentials, deviceInfo);

      if (!result.success) {
        return reply.status(401).send({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
          requiresTwoFactor: result.requiresTwoFactor,
          tempSessionId: result.tempSessionId
        });
      }

      // Set secure cookie with refresh token
      if (result.tokens?.refreshToken) {
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
      }

      return reply.send({
        success: true,
        user: result.user,
        tokens: {
          accessToken: result.tokens?.accessToken,
          expiresIn: result.tokens?.expiresIn
        },
        session: result.session
      });

    } catch (error) {
      logger.error({ error }, 'Login error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Register endpoint
   */
  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const registration = request.body as any;
      const deviceInfo = this.extractDeviceInfo(request);

      const result = await this.authService.registerUser(registration, deviceInfo);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
          errorCode: result.errorCode
        });
      }

      return reply.status(201).send({
        success: true,
        user: result.user,
        verificationRequired: result.verificationRequired
      });

    } catch (error) {
      logger.error({ error }, 'Registration error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Logout endpoint
   */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      
      // In real implementation, invalidate session and tokens
      // await this.authService.revokeSession(user.sessionId);

      // Clear refresh token cookie
      reply.clearCookie('refreshToken');

      return reply.send({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error({ error }, 'Logout error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Refresh token endpoint
   */
  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { refreshToken } = request.body as any;
      const cookieRefreshToken = request.cookies.refreshToken;

      const tokenToUse = refreshToken || cookieRefreshToken;

      if (!tokenToUse) {
        return reply.status(401).send({
          success: false,
          error: 'Refresh token required'
        });
      }

      // In real implementation, validate and refresh tokens
      // const result = await this.authService.refreshTokens(tokenToUse);

      return reply.send({
        success: true,
        tokens: {
          accessToken: 'new-access-token',
          expiresIn: 3600
        }
      });

    } catch (error) {
      logger.error({ error }, 'Token refresh error');
      return reply.status(401).send({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  }

  /**
   * Setup two-factor authentication
   */
  async setupTwoFactor(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      
      const result = await this.authService.setupTwoFactor(user.sub);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        secret: result.secret,
        qrCodeUrl: result.qrCodeUrl,
        backupCodes: result.backupCodes
      });

    } catch (error) {
      logger.error({ error }, 'Two-factor setup error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Verify two-factor authentication
   */
  async verifyTwoFactor(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { token, backupCode } = request.body as any;
      const { tempSessionId } = request.headers as any;

      if (!tempSessionId) {
        return reply.status(400).send({
          success: false,
          error: 'Temporary session required'
        });
      }

      // In real implementation, get user from temp session
      const userId = 'user-from-temp-session';
      
      const isValid = await this.authService.verifyTwoFactor(userId, token, backupCode);

      if (!isValid) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid two-factor code'
        });
      }

      // Complete login process
      return reply.send({
        success: true,
        message: 'Two-factor authentication verified'
      });

    } catch (error) {
      logger.error({ error }, 'Two-factor verification error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      
      return reply.send({
        success: true,
        user: {
          id: user.sub,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          creditPermissions: user.creditPermissions,
          kycStatus: user.kycStatus
        }
      });

    } catch (error) {
      logger.error({ error }, 'Get current user error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      status: 'healthy',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }

  // Placeholder methods for other endpoints
  async requestPasswordReset(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, message: 'Password reset email sent' });
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, message: 'Password reset successfully' });
  }

  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, message: 'Password changed successfully' });
  }

  async disableTwoFactor(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, message: 'Two-factor authentication disabled' });
  }

  async getSessions(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, sessions: [] });
  }

  async revokeSession(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, message: 'Session revoked' });
  }

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, message: 'Profile updated' });
  }

  /**
   * Extract device information from request
   */
  private extractDeviceInfo(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      deviceId: request.headers['x-device-id'] as string,
      deviceName: request.headers['x-device-name'] as string,
      deviceType: this.detectDeviceType(request.headers['user-agent'] || '')
    };
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(userAgent: string): 'mobile' | 'desktop' | 'tablet' | 'api' {
    if (userAgent.includes('Mobile')) return 'mobile';
    if (userAgent.includes('Tablet')) return 'tablet';
    if (userAgent.includes('Bot') || userAgent.includes('API')) return 'api';
    return 'desktop';
  }
}