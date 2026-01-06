import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      roles?: string[];
    }
    interface Request {
      user?: User;
    }
  }
}
