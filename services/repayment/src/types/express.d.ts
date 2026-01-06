import type { Request } from 'express';

/**
 * Extended user information attached to authenticated requests
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  roles?: string[];
  tenantId?: string;
  permissions?: string[];
}

/**
 * Extend Express Request to include user information from authentication middleware
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
