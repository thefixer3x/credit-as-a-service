import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users } from '../db/connection';
import { hashPassword, verifyPassword, generateToken, generateRefreshToken, generateSessionId } from '../utils/crypto';
import { logger } from '../utils/logger';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

export const authRoutes: FastifyPluginAsync = async function (fastify) {
  // Register endpoint
  fastify.post<{
    Body: z.infer<typeof registerSchema>;
  }>('/register', {
    schema: {
      description: 'Register a new user account',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', minLength: 1, maxLength: 100 },
          phone: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' }
              }
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const validatedData = registerSchema.parse(request.body);

    try {
      // Check if user already exists
      const existingUser = await db.select().from(users).where(eq(users.email, validatedData.email));
      
      if (existingUser.length > 0) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'User with this email already exists'
        });
      }

      // Hash password
      const passwordHash = await hashPassword(validatedData.password);
      const sessionId = generateSessionId();

      // Create user
      const [newUser] = await db.insert(users).values({
        email: validatedData.email,
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        phone: validatedData.phone,
        role: 'user',
        isActive: true,
        isVerified: false,
      }).returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      });

      // Generate tokens
      const tokenPayload = {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role || 'user',
        sessionId,
      };

      const accessToken = generateToken(tokenPayload, '24h');
      const refreshToken = generateRefreshToken(tokenPayload);

      // Log successful registration
      logger.info('User registered successfully', {
        userId: newUser.id,
        email: newUser.email,
        requestId: request.id,
        ipAddress: request.ip,
      });

      // Set refresh token as HTTP-only cookie
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth'
      });

      return reply.status(201).send({
        message: 'User registered successfully',
        user: newUser,
        tokens: {
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      logger.error('Registration failed', {
        error: error instanceof Error ? error.message : String(error),
        email: validatedData.email,
        requestId: request.id,
        ipAddress: request.ip,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Registration failed'
      });
    }
  });

  // Login endpoint
  fastify.post<{
    Body: z.infer<typeof loginSchema>;
  }>('/login', {
    schema: {
      description: 'Authenticate user and return access token',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          rememberMe: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' }
              }
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, rememberMe } = loginSchema.parse(request.body);

    try {
      // Find user
      const [user] = await db.select().from(users).where(eq(users.email, email));

      if (!user) {
        logger.warn('Login attempt with non-existent email', {
          email,
          requestId: request.id,
          ipAddress: request.ip,
        });

        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        logger.warn('Login attempt by deactivated user', {
          userId: user.id,
          email,
          requestId: request.id,
          ipAddress: request.ip,
        });

        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Account is deactivated'
        });
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.passwordHash);

      if (!isValidPassword) {
        logger.warn('Login attempt with invalid password', {
          userId: user.id,
          email,
          requestId: request.id,
          ipAddress: request.ip,
        });

        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const sessionId = generateSessionId();
      const tokenExpiry = rememberMe ? '7d' : '24h';

      // Generate tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role || 'user',
        sessionId,
      };

      const accessToken = generateToken(tokenPayload, tokenExpiry);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Update last login (optional - you might want to add this field to schema)
      // await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        sessionId,
        rememberMe,
        requestId: request.id,
        ipAddress: request.ip,
      });

      // Set refresh token as HTTP-only cookie
      const cookieMaxAge = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: cookieMaxAge,
        path: '/api/auth'
      });

      return reply.send({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      logger.error('Login failed', {
        error: error instanceof Error ? error.message : String(error),
        email,
        requestId: request.id,
        ipAddress: request.ip,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Login failed'
      });
    }
  });

  // Refresh token endpoint
  fastify.post<{
    Body: z.infer<typeof refreshTokenSchema>;
  }>('/refresh', {
    schema: {
      description: 'Refresh access token using refresh token',
      tags: ['Authentication'],
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const refreshToken = request.body?.refreshToken || request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token required'
        });
      }

      // Verify refresh token
      const decoded = fastify.jwt.verify(refreshToken);
      const { userId, email, role } = decoded as any;

      // Check if user still exists and is active
      const [user] = await db.select({
        id: users.id,
        isActive: users.isActive,
      }).from(users).where(eq(users.id, userId));

      if (!user || !user.isActive) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const sessionId = generateSessionId();
      const tokenPayload = { userId, email, role, sessionId };
      const newAccessToken = generateToken(tokenPayload, '24h');
      const newRefreshToken = generateRefreshToken(tokenPayload);

      logger.info('Token refreshed successfully', {
        userId,
        sessionId,
        requestId: request.id,
      });

      // Update refresh token cookie
      reply.setCookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth'
      });

      return reply.send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });

    } catch (error) {
      logger.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      });

      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid refresh token'
      });
    }
  });

  // Logout endpoint
  fastify.post('/logout', {
    schema: {
      description: 'Logout user and invalidate tokens',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send({ message: 'Logged out successfully' }); // Allow logout even with invalid token
      }
    }
  }, async (request, reply) => {
    const user = (request as any).user;

    if (user) {
      logger.info('User logged out', {
        userId: user.userId,
        sessionId: user.sessionId,
        requestId: request.id,
      });
    }

    // Clear refresh token cookie
    reply.clearCookie('refreshToken', { path: '/api/auth' });

    return reply.send({
      message: 'Logged out successfully'
    });
  });

  // Change password endpoint
  fastify.post<{
    Body: z.infer<typeof changePasswordSchema>;
  }>('/change-password', {
    schema: {
      description: 'Change user password',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request, reply) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
    const user = (request as any).user;

    try {
      // Get user's current password hash
      const [userRecord] = await db.select({
        passwordHash: users.passwordHash,
      }).from(users).where(eq(users.id, user.userId));

      if (!userRecord) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await verifyPassword(currentPassword, userRecord.passwordHash);

      if (!isCurrentPasswordValid) {
        logger.warn('Invalid current password during password change', {
          userId: user.userId,
          requestId: request.id,
        });

        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await db.update(users)
        .set({ 
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.userId));

      logger.info('Password changed successfully', {
        userId: user.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'Password changed successfully'
      });

    } catch (error) {
      logger.error('Password change failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Password change failed'
      });
    }
  });

  // Get current user profile
  fastify.get('/me', {
    schema: {
      description: 'Get current user profile',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                phone: { type: 'string' },
                role: { type: 'string' },
                isVerified: { type: 'boolean' },
                creditScore: { type: 'number' },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' }
              }
            }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
    }
  }, async (request, reply) => {
    const user = (request as any).user;

    try {
      const [userRecord] = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isVerified: users.isVerified,
        creditScore: users.creditScore,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      }).from(users).where(eq(users.id, user.userId));

      if (!userRecord) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      return reply.send({
        user: userRecord
      });

    } catch (error) {
      logger.error('Failed to get user profile', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get user profile'
      });
    }
  });
};