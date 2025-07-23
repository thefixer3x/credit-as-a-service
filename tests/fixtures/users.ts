import { hashTestPassword } from '../utils/auth';

export const userFixtures = {
  // Regular user fixtures
  user1: {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'john.doe@example.com',
    passwordHash: '', // Will be set by hashTestPassword
    password: 'Password123!', // Raw password for testing
    firstName: 'John',
    lastName: 'Doe',
    role: 'user',
    status: 'active',
    kycStatus: 'verified',
    twoFactorEnabled: false,
    lastLogin: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },

  user2: {
    id: 'user-002',
    tenantId: 'tenant-001',
    email: 'jane.smith@example.com',
    passwordHash: '',
    password: 'SecurePass456!',
    firstName: 'Jane',
    lastName: 'Smith',
    role: 'user',
    status: 'active',
    kycStatus: 'pending',
    twoFactorEnabled: true,
    twoFactorSecret: 'MOCK2FASECRET456',
    lastLogin: new Date('2024-01-20T14:30:00Z'),
    createdAt: new Date('2024-01-05T00:00:00Z'),
    updatedAt: new Date('2024-01-20T14:30:00Z'),
  },

  // Admin user fixtures
  admin1: {
    id: 'admin-001',
    tenantId: 'tenant-001',
    email: 'admin@example.com',
    passwordHash: '',
    password: 'AdminPass789!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    status: 'active',
    kycStatus: 'verified',
    twoFactorEnabled: true,
    twoFactorSecret: 'ADMINMOCK2FA123',
    lastLogin: new Date('2024-01-22T09:00:00Z'),
    createdAt: new Date('2023-12-01T00:00:00Z'),
    updatedAt: new Date('2024-01-22T09:00:00Z'),
  },

  // Lender user fixtures
  lender1: {
    id: 'lender-001',
    tenantId: 'tenant-001',
    email: 'lender@creditbank.com',
    passwordHash: '',
    password: 'LenderPass2024!',
    firstName: 'Credit',
    lastName: 'Lender',
    role: 'lender',
    status: 'active',
    kycStatus: 'verified',
    twoFactorEnabled: true,
    twoFactorSecret: 'LENDERMOCK2FA789',
    lastLogin: new Date('2024-01-22T08:00:00Z'),
    createdAt: new Date('2023-11-15T00:00:00Z'),
    updatedAt: new Date('2024-01-22T08:00:00Z'),
  },

  // Suspended user
  suspendedUser: {
    id: 'user-suspended',
    tenantId: 'tenant-001',
    email: 'suspended@example.com',
    passwordHash: '',
    password: 'SuspendedPass123!',
    firstName: 'Suspended',
    lastName: 'User',
    role: 'user',
    status: 'suspended',
    kycStatus: 'verified',
    twoFactorEnabled: false,
    lastLogin: new Date('2024-01-10T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-10T00:00:00Z'),
  },

  // Unverified user
  unverifiedUser: {
    id: 'user-unverified',
    tenantId: 'tenant-001',
    email: 'unverified@example.com',
    passwordHash: '',
    password: 'UnverifiedPass123!',
    firstName: 'Unverified',
    lastName: 'User',
    role: 'user',
    status: 'pending_verification',
    kycStatus: 'pending',
    twoFactorEnabled: false,
    createdAt: new Date('2024-01-20T00:00:00Z'),
    updatedAt: new Date('2024-01-20T00:00:00Z'),
  },
};

// User sessions fixtures
export const userSessionFixtures = {
  activeSession: {
    id: 'session-001',
    userId: 'user-001',
    deviceId: 'device-001',
    deviceName: 'Chrome Browser',
    deviceType: 'desktop',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    isActive: true,
    lastActivity: new Date('2024-01-22T10:00:00Z'),
    expiresAt: new Date('2024-02-22T10:00:00Z'),
    createdAt: new Date('2024-01-22T09:00:00Z'),
    updatedAt: new Date('2024-01-22T10:00:00Z'),
  },

  expiredSession: {
    id: 'session-002',
    userId: 'user-001',
    deviceId: 'device-002',
    deviceName: 'Mobile Safari',
    deviceType: 'mobile',
    ipAddress: '10.0.0.50',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    isActive: false,
    lastActivity: new Date('2024-01-10T15:00:00Z'),
    expiresAt: new Date('2024-01-15T15:00:00Z'),
    createdAt: new Date('2024-01-10T15:00:00Z'),
    updatedAt: new Date('2024-01-15T15:00:00Z'),
  },
};

// API Keys fixtures
export const apiKeyFixtures = {
  userApiKey: {
    id: 'api-key-001',
    userId: 'user-001',
    name: 'Integration Key',
    keyHash: 'hashed-api-key-value',
    permissions: ['read:profile', 'read:applications', 'create:applications'],
    isActive: true,
    lastUsed: new Date('2024-01-20T12:00:00Z'),
    expiresAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-20T12:00:00Z'),
  },

  adminApiKey: {
    id: 'api-key-admin-001',
    userId: 'admin-001',
    name: 'Admin Management Key',
    keyHash: 'hashed-admin-api-key-value',
    permissions: ['*'],
    isActive: true,
    lastUsed: new Date('2024-01-22T08:30:00Z'),
    expiresAt: null, // No expiration
    createdAt: new Date('2023-12-01T00:00:00Z'),
    updatedAt: new Date('2024-01-22T08:30:00Z'),
  },
};

// Password reset tokens
export const passwordResetTokenFixtures = {
  validToken: {
    id: 'reset-token-001',
    userId: 'user-001',
    token: 'valid-reset-token-123',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    used: false,
    createdAt: new Date(),
  },

  expiredToken: {
    id: 'reset-token-002',
    userId: 'user-002',
    token: 'expired-reset-token-456',
    expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
    used: false,
    createdAt: new Date(Date.now() - 7200000), // 2 hours ago
  },

  usedToken: {
    id: 'reset-token-003',
    userId: 'user-001',
    token: 'used-reset-token-789',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    used: true,
    usedAt: new Date(Date.now() - 1800000), // 30 minutes ago
    createdAt: new Date(Date.now() - 3600000), // 1 hour ago
  },
};

// Email verification tokens
export const emailVerificationTokenFixtures = {
  validToken: {
    id: 'email-token-001',
    userId: 'user-unverified',
    token: 'valid-email-token-123',
    expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
    verified: false,
    createdAt: new Date(),
  },

  expiredToken: {
    id: 'email-token-002',
    userId: 'user-002',
    token: 'expired-email-token-456',
    expiresAt: new Date(Date.now() - 86400000), // 24 hours ago
    verified: false,
    createdAt: new Date(Date.now() - 172800000), // 48 hours ago
  },
};

// Initialize password hashes
export async function initializeUserFixtures() {
  const users = Object.values(userFixtures);
  
  for (const user of users) {
    if (user.password && !user.passwordHash) {
      user.passwordHash = await hashTestPassword(user.password);
    }
  }
}

// Helper functions
export function getUserById(id: string) {
  return Object.values(userFixtures).find(user => user.id === id);
}

export function getUserByEmail(email: string) {
  return Object.values(userFixtures).find(user => user.email === email);
}

export function getUsersByRole(role: string) {
  return Object.values(userFixtures).filter(user => user.role === role);
}

export function getUsersByStatus(status: string) {
  return Object.values(userFixtures).filter(user => user.status === status);
}

export function getActiveUsers() {
  return Object.values(userFixtures).filter(user => user.status === 'active');
}

export function getVerifiedUsers() {
  return Object.values(userFixtures).filter(user => user.kycStatus === 'verified');
}