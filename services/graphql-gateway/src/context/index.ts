import { FastifyRequest } from 'fastify';

export interface GraphQLContext {
  request: FastifyRequest;
  userId?: string;
  userRole?: string;
  isAuthenticated: boolean;
}

export async function context({ request }: { request: FastifyRequest }): Promise<GraphQLContext> {
  // Extract user information from request headers or JWT token
  const authHeader = request.headers.authorization;
  let userId: string | undefined;
  let userRole: string | undefined;
  let isAuthenticated = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      // In a real implementation, you would verify the JWT token here
      // For now, we'll just extract basic info from the header
      const token = authHeader.substring(7);
      
      // TODO: Implement JWT verification
      // const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // userId = decoded.userId;
      // userRole = decoded.role;
      // isAuthenticated = true;
      
      // Placeholder for now
      isAuthenticated = true;
      userId = 'placeholder-user-id';
      userRole = 'user';
    } catch (error) {
      // Token verification failed
      isAuthenticated = false;
    }
  }

  return {
    request,
    userId,
    userRole,
    isAuthenticated,
  };
}
