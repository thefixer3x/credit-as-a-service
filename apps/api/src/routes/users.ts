import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, like, and, desc, asc } from 'drizzle-orm';
import { db, users } from '../db/connection';
import { hashPassword } from '../utils/crypto';
import { logger } from '../utils/logger';

// Validation schemas
const getUsersQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  search: z.string().optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'email', 'creditScore']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
});

const createUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional().default('user'),
  isActive: z.boolean().optional().default(true),
  isVerified: z.boolean().optional().default(false),
});

const updateUserPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

export const userRoutes: FastifyPluginAsync = async function (fastify) {
  // Middleware to verify admin/moderator access
  const requireAdminAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    
    if (!user || !['admin', 'moderator'].includes(user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin or moderator access required'
      });
    }
  };

  // Middleware to verify user can access resource
  const requireUserAccess = async (request: any, reply: any) => {
    await request.jwtVerify();
    const user = request.user;
    const userId = request.params.userId;
    
    // Admin can access any user, regular users can only access their own data
    if (user.role !== 'admin' && user.userId !== userId) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access denied'
      });
    }
  };

  // Get all users (admin only)
  fastify.get<{
    Querystring: z.infer<typeof getUsersQuerySchema>;
  }>('/', {
    schema: {
      description: 'Get paginated list of users',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          limit: { type: 'string' },
          search: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin', 'moderator'] },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
          sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'email', 'creditScore'] },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phone: { type: 'string' },
                  role: { type: 'string' },
                  isActive: { type: 'boolean' },
                  isVerified: { type: 'boolean' },
                  creditScore: { type: 'number' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' }
              }
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { page, limit, search, role, status, sortBy, sortOrder } = getUsersQuerySchema.parse(request.query);

    try {
      // Build query conditions
      const conditions = [];
      
      if (search) {
        conditions.push(
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        );
      }
      
      if (role) {
        conditions.push(eq(users.role, role));
      }
      
      if (status) {
        const isActive = status === 'active';
        conditions.push(eq(users.isActive, isActive));
      }

      // Get total count for pagination
      const totalQuery = conditions.length > 0 
        ? db.select().from(users).where(and(...conditions))
        : db.select().from(users);
      
      const totalUsers = (await totalQuery).length;
      const totalPages = Math.ceil(totalUsers / limit);

      // Get paginated results
      const sortColumn = users[sortBy as keyof typeof users];
      const sortFn = sortOrder === 'asc' ? asc : desc;
      
      const offset = (page - 1) * limit;
      
      const query = conditions.length > 0 
        ? db.select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            isVerified: users.isVerified,
            creditScore: users.creditScore,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          }).from(users).where(and(...conditions)).orderBy(sortFn(sortColumn)).limit(limit).offset(offset)
        : db.select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            isVerified: users.isVerified,
            creditScore: users.creditScore,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          }).from(users).orderBy(sortFn(sortColumn)).limit(limit).offset(offset);

      const userList = await query;

      logger.info('Users retrieved successfully', {
        requestId: request.id,
        count: userList.length,
        page,
        limit,
        search,
        role,
        status
      });

      return reply.send({
        users: userList,
        pagination: {
          page,
          limit,
          total: totalUsers,
          totalPages
        }
      });

    } catch (error) {
      logger.error('Failed to retrieve users', {
        error: error.message,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve users'
      });
    }
  });

  // Get user by ID
  fastify.get<{
    Params: { userId: string };
  }>('/:userId', {
    schema: {
      description: 'Get user by ID',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      },
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
                isActive: { type: 'boolean' },
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
    preHandler: requireUserAccess
  }, async (request, reply) => {
    const { userId } = request.params;

    try {
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        isVerified: users.isVerified,
        creditScore: users.creditScore,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      }).from(users).where(eq(users.id, userId));

      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      return reply.send({ user });

    } catch (error) {
      logger.error('Failed to get user', {
        error: error.message,
        userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get user'
      });
    }
  });

  // Create new user (admin only)
  fastify.post<{
    Body: z.infer<typeof createUserSchema>;
  }>('/', {
    schema: {
      description: 'Create a new user',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', minLength: 1, maxLength: 100 },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin', 'moderator'] },
          isActive: { type: 'boolean' },
          isVerified: { type: 'boolean' }
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
            }
          }
        }
      }
    },
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const validatedData = createUserSchema.parse(request.body);

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

      // Create user
      const [newUser] = await db.insert(users).values({
        email: validatedData.email,
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        phone: validatedData.phone,
        role: validatedData.role,
        isActive: validatedData.isActive,
        isVerified: validatedData.isVerified,
      }).returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      });

      logger.info('User created successfully by admin', {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
        createdBy: (request as any).user.userId,
        requestId: request.id,
      });

      return reply.status(201).send({
        message: 'User created successfully',
        user: newUser
      });

    } catch (error) {
      logger.error('User creation failed', {
        error: error.message,
        email: validatedData.email,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'User creation failed'
      });
    }
  });

  // Update user
  fastify.patch<{
    Params: { userId: string };
    Body: z.infer<typeof updateUserSchema>;
  }>('/:userId', {
    schema: {
      description: 'Update user information',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', minLength: 1, maxLength: 100 },
          phone: { type: 'string' },
          isActive: { type: 'boolean' },
          isVerified: { type: 'boolean' },
          role: { type: 'string', enum: ['user', 'admin', 'moderator'] }
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
                phone: { type: 'string' },
                role: { type: 'string' },
                isActive: { type: 'boolean' },
                isVerified: { type: 'boolean' }
              }
            }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      await request.jwtVerify();
      const user = (request as any).user;
      const userId = (request as any).params.userId;
      const updateData = (request as any).body;
      
      // Regular users can only update their own basic info
      if (user.role !== 'admin' && user.userId !== userId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }
      
      // Only admins can update role, isActive, isVerified
      if (user.role !== 'admin' && (updateData.role || updateData.isActive !== undefined || updateData.isVerified !== undefined)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Admin access required to update role or status'
        });
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params;
    const updateData = updateUserSchema.parse(request.body);

    try {
      // Check if user exists
      const [existingUser] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!existingUser) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      // Update user
      const [updatedUser] = await db.update(users)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          isVerified: users.isVerified,
        });

      logger.info('User updated successfully', {
        userId,
        updatedBy: (request as any).user.userId,
        changes: Object.keys(updateData),
        requestId: request.id,
      });

      return reply.send({
        message: 'User updated successfully',
        user: updatedUser
      });

    } catch (error) {
      logger.error('User update failed', {
        error: error.message,
        userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'User update failed'
      });
    }
  });

  // Update user password (admin only)
  fastify.patch<{
    Params: { userId: string };
    Body: z.infer<typeof updateUserPasswordSchema>;
  }>('/:userId/password', {
    schema: {
      description: 'Update user password (admin only)',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['newPassword'],
        properties: {
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
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { userId } = request.params;
    const { newPassword } = updateUserPasswordSchema.parse(request.body);

    try {
      // Check if user exists
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update password
      await db.update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      logger.info('User password updated by admin', {
        userId,
        updatedBy: (request as any).user.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'Password updated successfully'
      });

    } catch (error) {
      logger.error('Password update failed', {
        error: error.message,
        userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Password update failed'
      });
    }
  });

  // Delete user (admin only)
  fastify.delete<{
    Params: { userId: string };
  }>('/:userId', {
    schema: {
      description: 'Delete user (admin only)',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
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
    preHandler: requireAdminAccess
  }, async (request, reply) => {
    const { userId } = request.params;
    const currentUser = (request as any).user;

    try {
      // Prevent admin from deleting themselves
      if (currentUser.userId === userId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot delete your own account'
        });
      }

      // Check if user exists
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        });
      }

      // Delete user
      await db.delete(users).where(eq(users.id, userId));

      logger.info('User deleted by admin', {
        deletedUserId: userId,
        deletedUserEmail: user.email,
        deletedBy: currentUser.userId,
        requestId: request.id,
      });

      return reply.send({
        message: 'User deleted successfully'
      });

    } catch (error) {
      logger.error('User deletion failed', {
        error: error.message,
        userId,
        requestId: request.id,
      });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'User deletion failed'
      });
    }
  });
};