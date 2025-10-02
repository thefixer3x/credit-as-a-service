import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { testConfig } from '../setup/test-env';

export interface TestUser {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  permissions?: string[];
  creditPermissions?: Record<string, any>;
}

export function generateTestJWT(user: TestUser, expiresIn: string = '1h'): string {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    permissions: user.permissions || [],
    creditPermissions: user.creditPermissions || {},
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, testConfig.auth.jwtSecret, { expiresIn });
}

export function generateTestRefreshToken(userId: string): string {
  const payload = {
    sub: userId,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, testConfig.auth.jwtSecret, { 
    expiresIn: testConfig.auth.refreshTokenExpiry 
  });
}

export function verifyTestJWT(token: string): any {
  try {
    return jwt.verify(token, testConfig.auth.jwtSecret);
  } catch (error) {
    throw new Error('Invalid test JWT token');
  }
}

export async function hashTestPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function compareTestPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createTestAuthHeaders(user: TestUser): Record<string, string> {
  const token = generateTestJWT(user);
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: `user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    role: 'user',
    tenantId: `tenant-${Date.now()}`,
    permissions: ['read:profile', 'update:profile'],
    creditPermissions: {
      canApply: true,
      maxAmount: 50000,
    },
    ...overrides,
  };
}

export function createTestAdminUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestUser({
    role: 'admin',
    permissions: [
      'read:users',
      'create:users',
      'update:users',
      'delete:users',
      'read:loans',
      'approve:loans',
      'read:payments',
      'process:payments',
    ],
    creditPermissions: {
      canApprove: true,
      canReject: true,
      maxApprovalAmount: 100000,
    },
    ...overrides,
  });
}

export function createTestLenderUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestUser({
    role: 'lender',
    permissions: [
      'read:loans',
      'create:offers',
      'read:applications',
      'read:payments',
    ],
    creditPermissions: {
      canCreateOffers: true,
      maxOfferAmount: 250000,
      riskThreshold: 600,
    },
    ...overrides,
  });
}

// Mock authentication middleware for testing
export function mockAuthMiddleware(user?: TestUser) {
  return (req: any, res: any, next: any) => {
    if (user) {
      req.user = user;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          req.user = verifyTestJWT(token);
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
      } else {
        return res.status(401).json({ error: 'No token provided' });
      }
    }
    next();
  };
}