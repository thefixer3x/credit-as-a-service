import { Request } from 'express';
import jwt from 'jsonwebtoken';

export interface GraphQLContext {
  req: Request;
  userId?: string;
  userRole?: string;
  isAuthenticated: boolean;
}

interface JWTPayload {
  userId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function context({ req }: { req: Request }): Promise<GraphQLContext> {
  // Extract user information from request headers or JWT token
  const authHeader = req.headers.authorization;
  let userId: string | undefined;
  let userRole: string | undefined;
  let isAuthenticated = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET;

      if (!jwtSecret) {
        throw new Error('JWT_SECRET is not configured');
      }

      // Verify and decode the JWT token
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

      userId = decoded.userId;
      userRole = decoded.role;
      isAuthenticated = true;
    } catch (error) {
      // Token verification failed (invalid signature, expired, malformed, etc.)
      isAuthenticated = false;
    }
  }

  return {
    req,
    userId,
    userRole,
    isAuthenticated,
  };
}
